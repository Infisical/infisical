import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { groupBy } from "@app/lib/fn";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectFolderGrantDALFactory } from "@app/services/project-folder-grant/project-folder-grant-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { fnSecretsV2FromImports } from "@app/services/secret-import/secret-import-fns";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  createSecretSyncPayload,
  TSecretPayload,
  TSecretSyncPayload
} from "@app/services/secret-sync/secret-sync-payload";
import { expandSecretReferencesFactory } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { recursivelyGetSecretPaths } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";

type TImportedSecret = Awaited<ReturnType<typeof fnSecretsV2FromImports>>[number]["secrets"][number];

type TExpandSecretReferences = ReturnType<typeof expandSecretReferencesFactory>["expandSecretReferences"];

export type TFnSecretsV2FromImportsDeps = {
  projectFolderGrantDAL: Pick<TProjectFolderGrantDALFactory, "find">;
  actorOrgId: string;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export const SECRET_SYNC_MAX_SECRETS = 10_000;

export const assertWithinSecretLimit = (count: number) => {
  if (count <= SECRET_SYNC_MAX_SECRETS) return;

  throw new SecretSyncError({
    message: `This sync covers ${count} secrets, which is above the limit of ${SECRET_SYNC_MAX_SECRETS} for a single sync. Point the sync at a narrower secret path, or split it into several syncs.`,
    shouldRetry: false
  });
};

export const resolveSyncFolders = async ({
  folderDAL,
  projectEnvDAL,
  projectId,
  environment,
  sourcePath,
  sourceFolderId,
  recursive
}: {
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectId: string;
  environment: string;
  sourcePath: string;
  sourceFolderId: string;
  recursive: boolean;
}): Promise<{ folderId: string; path: string }[]> => {
  if (!recursive) return [{ folderId: sourceFolderId, path: sourcePath }];

  const paths = await recursivelyGetSecretPaths({
    folderDAL,
    projectEnvDAL,
    projectId,
    environment,
    currentPath: sourcePath
  });

  if (!paths.length) {
    throw new SecretSyncError({
      message: `Could not find the folder "${sourcePath}" in environment "${environment}". Update the sync's source environment and secret path.`,
      shouldRetry: false
    });
  }

  return paths.map(({ folderId, path }) => ({ folderId, path }));
};

export const mergeImportedSecrets = (
  localEntries: TSecretPayload[],
  importsByFolder: { path: string; secrets: TImportedSecret[] }[]
): TSecretPayload[] => {
  const merged = [...localEntries];

  for (let i = importsByFolder.length - 1; i >= 0; i -= 1) {
    const { path, secrets } = importsByFolder[i];
    const claimedInFolder = new Set(merged.filter((entry) => entry.path === path).map((entry) => entry.key));

    for (const imported of secrets) {
      if (claimedInFolder.has(imported.key)) continue;

      claimedInFolder.add(imported.key);
      merged.push({
        key: imported.key,
        path,
        value: imported.secretValue || "",
        id: imported.id,
        comment: imported.secretComment,
        secretMetadata: imported.secretMetadata
      });
    }
  }

  return merged;
};

export const buildSyncPayload = async (
  deps: {
    folderDAL: Pick<TSecretFolderDALFactory, "find" | "findByManySecretPath">;
    projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
    secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderId" | "findByFolderIds" | "find">;
    secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds" | "findByIds">;
    expandSecretReferences: TExpandSecretReferences;
    decryptSecretValue: (value?: Buffer | null) => string;
    fnSecretsV2FromImportsDeps: TFnSecretsV2FromImportsDeps;
  },
  args: {
    projectId: string;
    environment: string;
    sourcePath: string;
    sourceFolderId: string;
    recursive: boolean;
    keySchema?: string;
    includeImports: boolean;
  }
): Promise<TSecretSyncPayload> => {
  const { folderDAL, projectEnvDAL, secretV2BridgeDAL, secretImportDAL, expandSecretReferences, decryptSecretValue } =
    deps;
  const { projectId, environment, sourcePath, sourceFolderId, recursive, keySchema, includeImports } = args;

  const folders = await resolveSyncFolders({
    folderDAL,
    projectEnvDAL,
    projectId,
    environment,
    sourcePath,
    sourceFolderId,
    recursive
  });

  const pathByFolderId = new Map(folders.map(({ folderId, path }) => [folderId, path]));

  // findByFolderIds joins tags, metadata, rotation, honey token, reminder, recipients and users
  // plus a DENSE_RANK window, so it costs far more than the three narrow queries findByFolderId
  // runs. Every non-recursive sync (the vast majority today) hits this path, so it keeps using
  // the cheaper single-folder read; only a genuinely multi-folder subtree pays for the join.
  const secrets =
    folders.length === 1
      ? await secretV2BridgeDAL.findByFolderId({ folderId: folders[0].folderId })
      : await secretV2BridgeDAL.findByFolderIds({ folderIds: folders.map(({ folderId }) => folderId) });

  assertWithinSecretLimit(secrets.length);

  const entries: TSecretPayload[] = [];

  await Promise.allSettled(
    secrets.map(async (secret) => {
      const secretPath = pathByFolderId.get(secret.folderId) ?? sourcePath;
      const secretValue = decryptSecretValue(secret.encryptedValue);
      const expandedSecretValue = await expandSecretReferences({
        environment,
        secretPath,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        value: secretValue,
        secretKey: secret.key
      });

      entries.push({
        key: secret.key,
        path: secretPath,
        value: expandedSecretValue || "",
        id: secret.id,
        comment: secret.encryptedComment ? decryptSecretValue(secret.encryptedComment) : undefined,
        secretMetadata: secret.secretMetadata.map((el) => ({
          isEncrypted: Boolean(el.encryptedValue),
          key: el.key,
          value: el.encryptedValue ? decryptSecretValue(el.encryptedValue) : el.value || ""
        }))
      });
    })
  );

  if (!includeImports) {
    return createSecretSyncPayload(entries, { environment, keySchema });
  }

  const secretImports = await secretImportDAL.findByFolderIds(folders.map(({ folderId }) => folderId));

  let allEntries = entries;

  if (secretImports.length) {
    // fnSecretsV2FromImports dedupes by (importEnv, importPath) across the whole batch it is
    // given, keeping one result row per source. Two folders importing the same source in one
    // batched call would collapse to a single importFolderId, silently dropping the other
    // folder's copy from the payload. Calling it once per declaring folder keeps each call's
    // dedup scoped to that folder's own imports, so every declaring folder gets its own result.
    const importsByDeclaringFolder = groupBy(secretImports, (secretImport) => secretImport.folderId);

    const importedSecrets = (
      await Promise.all(
        Object.values(importsByDeclaringFolder).map((declaringFolderImports) =>
          fnSecretsV2FromImports({
            decryptor: decryptSecretValue,
            folderDAL,
            secretDAL: secretV2BridgeDAL,
            expandSecretReferences,
            secretImportDAL,
            secretImports: declaringFolderImports,
            hasSecretAccess: () => true,
            viewSecretValue: true,
            projectId,
            ...deps.fnSecretsV2FromImportsDeps
          })
        )
      )
    ).flat();

    allEntries = mergeImportedSecrets(
      entries,
      importedSecrets.map((group) => ({
        path: pathByFolderId.get(group.importFolderId) ?? sourcePath,
        secrets: group.secrets
      }))
    );

    assertWithinSecretLimit(allEntries.length);
  }

  return createSecretSyncPayload(allEntries, { environment, keySchema });
};
