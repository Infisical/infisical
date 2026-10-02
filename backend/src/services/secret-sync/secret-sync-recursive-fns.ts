import { groupBy } from "@app/lib/fn";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectFolderGrantDALFactory } from "@app/services/project-folder-grant/project-folder-grant-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { fnSecretsV2FromImports } from "@app/services/secret-import/secret-import-fns";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  createSecretSyncPayload,
  TSecretPayload,
  TSecretSyncPayload
} from "@app/services/secret-sync/secret-sync-payload";
import { TSecretSync } from "@app/services/secret-sync/secret-sync-types";
import { expandSecretReferencesFactory } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { recursivelyGetSecretPaths } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";

type TImportedSecret = Awaited<ReturnType<typeof fnSecretsV2FromImports>>[number]["secrets"][number];

type TExpandSecretReferences = ReturnType<typeof expandSecretReferencesFactory>["expandSecretReferences"];

export type TFnSecretsV2FromImportsDeps = {
  projectFolderGrantDAL: Pick<TProjectFolderGrantDALFactory, "find">;
  actorOrgId: string;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const toPathSegments = (path: string) => path.split("/").filter(Boolean);

// A sync on the path itself always covers it, whether or not it includes subfolders. A sync on an
// ancestor folder only covers it when it includes them. The path need not exist yet: a folder being
// moved has no folder at its landing path, and only the recursive syncs above it can cover it there.
export const isPathCoveredBySecretSync = (
  sync: {
    environment?: { id: string } | null;
    folder?: { path: string } | null;
    syncOptions?: unknown;
  },
  { envId, secretPath }: { envId: string; secretPath: string }
) => {
  if (!sync.folder || sync.environment?.id !== envId) return false;

  const syncSegments = toPathSegments(sync.folder.path);
  const pathSegments = toPathSegments(secretPath);

  if (syncSegments.length > pathSegments.length) return false;
  if (syncSegments.some((segment, index) => segment !== pathSegments[index])) return false;

  return (
    syncSegments.length === pathSegments.length ||
    Boolean((sync.syncOptions as TSecretSync["syncOptions"])?.includeAllSubFolders)
  );
};

// A move or copy can land items anywhere beneath its destination, so a sync rooted below the destination
// counts as well as one covering it. This can warn about a sync that nothing ends up under, which is
// safer for a warning than missing one.
export const isPathOrDescendantCoveredBySecretSync = (
  sync: Parameters<typeof isPathCoveredBySecretSync>[0],
  { envId, secretPath }: { envId: string; secretPath: string }
) => {
  if (isPathCoveredBySecretSync(sync, { envId, secretPath })) return true;
  if (!sync.folder || sync.environment?.id !== envId) return false;

  const syncSegments = toPathSegments(sync.folder.path);
  const pathSegments = toPathSegments(secretPath);

  return pathSegments.every((segment, index) => syncSegments[index] === segment);
};

type TCoveringSync = {
  id: string;
  name: string;
  destination: string;
  folder?: { path: string } | null;
  syncOptions?: unknown;
  isAutoSyncEnabled: boolean;
};

// A sync that already covers the source is left out, since the items already reach it. Syncs the actor
// cannot read collapse into one flag, so the warning still reaches them without revealing how many
// there are or what they cover.
export const toSyncsNewlyCoveringPath = <T extends TCoveringSync>({
  sourceSyncs,
  destinationSyncs,
  canRead
}: {
  sourceSyncs: T[];
  destinationSyncs: T[];
  canRead: (sync: T) => boolean;
}) => {
  const sourceSyncIds = new Set(sourceSyncs.map((sync) => sync.id));
  const newSyncs = destinationSyncs.filter((sync) => !sourceSyncIds.has(sync.id));
  const readableSyncs = newSyncs.filter(canRead);

  return {
    secretSyncs: readableSyncs
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((sync) => ({
        id: sync.id,
        name: sync.name,
        destination: sync.destination as SecretSync,
        secretPath: sync.folder?.path ?? null,
        includeAllSubFolders: Boolean((sync.syncOptions as TSecretSync["syncOptions"])?.includeAllSubFolders),
        isAutoSyncEnabled: sync.isAutoSyncEnabled
      })),
    hasHiddenSecretSyncs: readableSyncs.length < newSyncs.length
  };
};

export const getSyncedFolders = async ({
  folderDAL,
  projectEnvDAL,
  projectId,
  environment,
  sourcePath,
  sourceFolderId,
  includeAllSubFolders
}: {
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectId: string;
  environment: string;
  sourcePath: string;
  sourceFolderId: string;
  includeAllSubFolders: boolean;
}): Promise<{ folderId: string; path: string }[]> => {
  if (!includeAllSubFolders) return [{ folderId: sourceFolderId, path: sourcePath }];

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

// Resolves and decrypts every secret in the sync's source subtree (a single folder, or, when the
// sync includes subfolders, that folder plus every folder beneath it), merging in any imports, and wraps the
// result in a TSecretSyncPayload. A cross-folder duplicate name is not resolved here: flatten()
// throws on it by default, and payload.dedupeConflicts() is how the one caller that needs to
// tolerate it (removal) gets a payload that won't.
export const buildSyncPayload = async (
  args: {
    projectId: string;
    environment: string;
    sourcePath: string;
    sourceFolderId: string;
    syncOptions: Pick<TSecretSync["syncOptions"], "includeAllSubFolders" | "keySchema"> | undefined;
    includeImports: boolean;
  },
  deps: {
    folderDAL: Pick<TSecretFolderDALFactory, "find" | "findByManySecretPath">;
    projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
    secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderIds" | "find">;
    secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds" | "findByIds">;
    expandSecretReferences: TExpandSecretReferences;
    decryptSecretValue: (value?: Buffer | null) => string;
    fnSecretsV2FromImportsDeps: TFnSecretsV2FromImportsDeps;
  }
): Promise<TSecretSyncPayload> => {
  const { folderDAL, projectEnvDAL, secretV2BridgeDAL, secretImportDAL, expandSecretReferences, decryptSecretValue } =
    deps;
  const { projectId, environment, sourcePath, sourceFolderId, syncOptions, includeImports } = args;
  const { includeAllSubFolders, keySchema } = syncOptions ?? {};

  const folders = await getSyncedFolders({
    folderDAL,
    projectEnvDAL,
    projectId,
    environment,
    sourcePath,
    sourceFolderId,
    includeAllSubFolders: Boolean(includeAllSubFolders)
  });

  const pathByFolderId = new Map(folders.map(({ folderId, path }) => [folderId, path]));

  const secrets = await secretV2BridgeDAL.findByFolderIds({ folderIds: folders.map(({ folderId }) => folderId) });

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
  }

  return createSecretSyncPayload(allEntries, { environment, keySchema });
};
