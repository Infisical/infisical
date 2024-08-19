import { SecretType, TSecretImports, TSecrets, TSecretsV2 } from "@app/db/schemas";
import { groupBy, unique } from "@app/lib/fn";

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

export const fnSecretsV2FromImports = async ({
  allowedImports: possibleCyclicImports,
  folderDAL,
  secretDAL,
  secretImportDAL,
  depth = 0,
  cyclicDetector = new Set(),
  decryptor,
  expandSecretReferences
}: {
  allowedImports: (Omit<TSecretImports, "importEnv"> & {
    importEnv: { id: string; slug: string; name: string };
  })[];
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath">;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds">;
  depth?: number;
  cyclicDetector?: Set<string>;
  decryptor: (value?: Buffer | null) => string;
  expandSecretReferences?: (
    secrets: Record<string, { value?: string; comment?: string; skipMultilineEncoding?: boolean | null }>
  ) => Promise<Record<string, { value?: string; comment?: string; skipMultilineEncoding?: boolean | null }>>;
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
  let secretsFromDeeperImports: TSecretImportSecretsV2[] = [];
  if (deeperImports.length) {
    secretsFromDeeperImports = await fnSecretsV2FromImports({
      allowedImports: deeperImports.filter(({ isReplication }) => !isReplication),
      secretImportDAL,
      folderDAL,
      secretDAL,
      depth: depth + 1,
      cyclicDetector,
      decryptor,
      expandSecretReferences
    });
  }
  const secretsFromdeeperImportGroupedByFolderId = groupBy(secretsFromDeeperImports, (i) => i.importFolderId);

  const processedImports = allowedImports.map(({ importPath, importEnv, id, folderId }, i) => {
    const sourceImportFolder = importedFolderGroupBySourceImport[`${importEnv.id}-${importPath}`][0];
    const folderDeeperImportSecrets =
      secretsFromdeeperImportGroupedByFolderId?.[sourceImportFolder?.id || ""]?.[0]?.secrets || [];
    const secretsWithDuplicate = (importedSecretsGroupByFolderId?.[importedFolders?.[i]?.id as string] || [])
      .map((item) => ({
        ...item,
        secretKey: item.key,
        secretValue: decryptor(item.encryptedValue),
        secretComment: decryptor(item.encryptedComment),
        environment: importEnv.slug,
        workspace: "", // This field should not be used, it's only here to keep the older Python SDK versions backwards compatible with the new Postgres backend.
        _id: item.id // The old Python SDK depends on the _id field being returned. We return this to keep the older Python SDK versions backwards compatible with the new Postgres backend.
      }))
      .concat(folderDeeperImportSecrets);

    return {
      secretPath: importPath,
      environment: importEnv.slug,
      environmentInfo: importEnv,
      folderId: importedFolders?.[i]?.id,
      id,
      importFolderId: folderId,
      secrets: unique(secretsWithDuplicate, (el) => el.secretKey)
    };
  });

  if (expandSecretReferences) {
    await Promise.all(
      processedImports.map(async (processedImport) => {
        const secretsGroupByKey = processedImport.secrets.reduce(
          (acc, item) => {
            acc[item.secretKey] = {
              value: item.secretValue,
              comment: item.secretComment,
              skipMultilineEncoding: item.skipMultilineEncoding
            };
            return acc;
          },
          {} as Record<string, { value: string; comment?: string; skipMultilineEncoding?: boolean | null }>
        );
        // eslint-disable-next-line
        await expandSecretReferences(secretsGroupByKey);
        processedImport.secrets.forEach((decryptedSecret) => {
          // eslint-disable-next-line no-param-reassign
          decryptedSecret.secretValue = secretsGroupByKey[decryptedSecret.secretKey].value;
        });
      })
    );
  }

  return processedImports;
};
