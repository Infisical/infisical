import { SecretType, TSecretImports, TSecrets, TSecretsV2 } from "@app/db/schemas";
import { groupBy, unique } from "@app/lib/fn";

import { ResourceMetadataDTO } from "../resource-metadata/resource-metadata-schema";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretImportDALFactory } from "./secret-import-dal";

type TSecretImportSecrets = {
  secretPath: string;
  environment: string;
  environmentInfo: {
    id: string;
    slug: string;
    name: string;
  };
  folderId: string | undefined;
  importFolderId: string;
  secrets: (TSecrets & { workspace: string; environment: string; _id: string })[];
};

type TSecretImportSecretsV2 = {
  secretPath: string;
  environment: string;
  environmentInfo: {
    id: string;
    slug: string;
    name: string;
  };
  id: string;
  folderId: string | undefined;
  importFolderId: string;
  secrets: (TSecretsV2 & {
    workspace: string;
    environment: string;
    _id: string;
    secretKey: string;
    // akhilmhdh: yes i know you can put ?.
    // But for somereason ts consider ? and undefined explicit as different just ts things
    secretValue: string;
    secretComment: string;
    secretMetadata?: ResourceMetadataDTO;
  })[];
};

const LEVEL_BREAK = 10;
const getImportUniqKey = (envSlug: string, path: string) => `${envSlug}=${path}`;
export const fnSecretsFromImports = async ({
  allowedImports: possibleCyclicImports,
  folderDAL,
  secretDAL,
  secretImportDAL,
  depth = 0,
  cyclicDetector = new Set()
}: {
  allowedImports: (Omit<TSecretImports, "importEnv"> & {
    importEnv: { id: string; slug: string; name: string };
  })[];
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds">;
  depth?: number;
  cyclicDetector?: Set<string>;
}) => {
  // avoid going more than a depth
  if (depth >= LEVEL_BREAK) return [];

  const allowedImports = possibleCyclicImports.filter(
    ({ importPath, importEnv }) => !cyclicDetector.has(getImportUniqKey(importEnv.slug, importPath))
  );

  const importedFolders = (
    await folderDAL.findByManySecretPath(
      allowedImports.map(({ importEnv, importPath }) => ({
        envId: importEnv.id,
        secretPath: importPath
      }))
    )
  ).filter(Boolean); // remove undefined ones
  if (!importedFolders.length) {
    return [];
  }

  const importedFolderIds = importedFolders.map((el) => el?.id) as string[];
  const importedFolderGroupBySourceImport = groupBy(importedFolders, (i) => `${i?.envId}-${i?.path}`);
  const importedSecrets = await secretDAL.find(
    {
      $in: { folderId: importedFolderIds },
      type: SecretType.Shared
    },
    {
      sort: [["id", "asc"]]
    }
  );

  const importedSecretsGroupByFolderId = groupBy(importedSecrets, (i) => i.folderId);

  allowedImports.forEach(({ importPath, importEnv }) => {
    cyclicDetector.add(getImportUniqKey(importEnv.slug, importPath));
  });
  // now we need to check recursively deeper imports made inside other imports
  // we go level wise meaning we take all imports of a tree level and then go deeper ones level by level
  const deeperImports = await secretImportDAL.findByFolderIds(importedFolderIds);
  let secretsFromDeeperImports: TSecretImportSecrets[] = [];
  if (deeperImports.length) {
    secretsFromDeeperImports = await fnSecretsFromImports({
      allowedImports: deeperImports.filter(({ isReplication }) => !isReplication),
      secretImportDAL,
      folderDAL,
      secretDAL,
      depth: depth + 1,
      cyclicDetector
    });
  }
  const secretsFromdeeperImportGroupedByFolderId = groupBy(secretsFromDeeperImports, (i) => i.importFolderId);

  const secrets = allowedImports.map(({ importPath, importEnv, id, folderId }, i) => {
    const sourceImportFolder = importedFolderGroupBySourceImport?.[`${importEnv.id}-${importPath}`]?.[0];
    const folderDeeperImportSecrets =
      secretsFromdeeperImportGroupedByFolderId?.[sourceImportFolder?.id || ""]?.[0]?.secrets || [];

    return {
      secretPath: importPath,
      environment: importEnv.slug,
      environmentInfo: importEnv,
      folderId: importedFolders?.[i]?.id,
      id,
      importFolderId: folderId,
      // this will ensure for cases when secrets are empty. Could be due to missing folder for a path or when emtpy secrets inside a given path
      secrets: (importedSecretsGroupByFolderId?.[importedFolders?.[i]?.id as string] || [])
        .map((item) => ({
          ...item,
          environment: importEnv.slug,
          workspace: "", // This field should not be used, it's only here to keep the older Python SDK versions backwards compatible with the new Postgres backend.
          _id: item.id // The old Python SDK depends on the _id field being returned. We return this to keep the older Python SDK versions backwards compatible with the new Postgres backend.
        }))
        .concat(folderDeeperImportSecrets)
    };
  });

  return secrets;
};

/* eslint-disable no-await-in-loop, no-continue */
export const fnSecretsV2FromImports = async ({
  secretImports: rootSecretImports,
  folderDAL,
  secretDAL,
  secretImportDAL,
  decryptor,
  expandSecretReferences,
  hasSecretAccess
}: {
  secretImports: (Omit<TSecretImports, "importEnv"> & {
    importEnv: { id: string; slug: string; name: string };
  })[];
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath">;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds">;
  decryptor: (value?: Buffer | null) => string;
  expandSecretReferences?: (inputSecret: {
    value?: string;
    skipMultilineEncoding?: boolean | null;
    secretPath: string;
    environment: string;
  }) => Promise<string | undefined>;
  hasSecretAccess: (environment: string, secretPath: string, secretName: string, secretTagSlugs: string[]) => boolean;
}) => {
  const cyclicDetector = new Set();
  const stack: { secretImports: typeof rootSecretImports; depth: number; parentImportedSecrets: TSecretsV2[] }[] = [
    { secretImports: rootSecretImports, depth: 0, parentImportedSecrets: [] }
  ];

  const processedImports: TSecretImportSecretsV2[] = [];

  while (stack.length) {
    const { secretImports, depth, parentImportedSecrets } = stack.pop()!;

    if (depth > LEVEL_BREAK) continue;
    const sanitizedImports = secretImports.filter(
      ({ importPath, importEnv }) => !cyclicDetector.has(getImportUniqKey(importEnv.slug, importPath))
    );

    if (!sanitizedImports.length) continue;

    const importedFolders = await folderDAL.findByManySecretPath(
      sanitizedImports.map(({ importEnv, importPath }) => ({
        envId: importEnv.id,
        secretPath: importPath
      }))
    );
    if (!importedFolders.length) continue;

    const importedFolderIds = importedFolders.map((el) => el?.id) as string[];
    const importedFolderGroupBySourceImport = groupBy(importedFolders, (i) => `${i?.envId}-${i?.path}`);

    const importedSecrets = await secretDAL.find(
      {
        $in: { folderId: importedFolderIds },
        type: SecretType.Shared
      },
      {
        sort: [["id", "asc"]]
      }
    );
    const importedSecretsGroupByFolderId = groupBy(importedSecrets, (i) => i.folderId);

    sanitizedImports.forEach(({ importPath, importEnv }) => {
      cyclicDetector.add(getImportUniqKey(importEnv.slug, importPath));
    });
    // now we need to check recursively deeper imports made inside other imports
    // we go level wise meaning we take all imports of a tree level and then go deeper ones level by level
    const deeperImports = await secretImportDAL.findByFolderIds(importedFolderIds);
    const deeperImportsGroupByFolderId = groupBy(deeperImports, (i) => i.folderId);

    const isFirstIteration = !processedImports.length;
    sanitizedImports.forEach(({ importPath, importEnv, id, folderId }, i) => {
      const sourceImportFolder = importedFolderGroupBySourceImport[`${importEnv.id}-${importPath}`]?.[0];
      const secretsWithDuplicate = (importedSecretsGroupByFolderId?.[importedFolders?.[i]?.id as string] || [])
        .filter((item) =>
          hasSecretAccess(
            importEnv.slug,
            importPath,
            item.key,
            item.tags.map((el) => el.slug)
          )
        )
        .map((item) => ({
          ...item,
          secretKey: item.key,
          secretValue: decryptor(item.encryptedValue),
          secretComment: decryptor(item.encryptedComment),
          environment: importEnv.slug,
          workspace: "", // This field should not be used, it's only here to keep the older Python SDK versions backwards compatible with the new Postgres backend.
          _id: item.id // The old Python SDK depends on the _id field being returned. We return this to keep the older Python SDK versions backwards compatible with the new Postgres backend.
        }));

      if (deeperImportsGroupByFolderId?.[sourceImportFolder?.id || ""]) {
        stack.push({
          secretImports: deeperImportsGroupByFolderId[sourceImportFolder?.id || ""],
          depth: depth + 1,
          parentImportedSecrets: secretsWithDuplicate
        });
      }

      if (isFirstIteration) {
        processedImports.push({
          secretPath: importPath,
          environment: importEnv.slug,
          environmentInfo: importEnv,
          folderId: importedFolders?.[i]?.id,
          id,
          importFolderId: folderId,
          secrets: secretsWithDuplicate
        });
      } else {
        parentImportedSecrets.push(...secretsWithDuplicate);
      }
    });
  }
  /* eslint-enable */
  if (expandSecretReferences) {
    await Promise.allSettled(
      processedImports.map((processedImport) => {
        // eslint-disable-next-line
        processedImport.secrets = unique(processedImport.secrets, (i) => i.key);
        return Promise.allSettled(
          processedImport.secrets.map(async (decryptedSecret, index) => {
            const expandedSecretValue = await expandSecretReferences({
              value: decryptedSecret.secretValue,
              secretPath: processedImport.secretPath,
              environment: processedImport.environment,
              skipMultilineEncoding: decryptedSecret.skipMultilineEncoding
            });
            // eslint-disable-next-line no-param-reassign
            processedImport.secrets[index].secretValue = expandedSecretValue || "";
          })
        );
      })
    );
  }

  return processedImports;
};
