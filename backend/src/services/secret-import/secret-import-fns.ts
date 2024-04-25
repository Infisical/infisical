import { SecretType, TSecretImports, TSecrets } from "@app/db/schemas";
import { groupBy } from "@app/lib/fn";

import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
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

const LEVEL_BREAK = 10;
export const fnSecretsFromImports = async ({
  allowedImports,
  folderDAL,
  secretDAL,
  secretImportDAL,
  depth = 0
}: {
  allowedImports: (Omit<TSecretImports, "importEnv"> & {
    importEnv: { id: string; slug: string; name: string };
  })[];
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds">;
  depth?: number;
}) => {
  // avoid going more than a depth
  if (depth >= LEVEL_BREAK) return [];

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

  // now we need to check recursively deeper imports made inside other imports
  // we go level wise meaning we take all imports of a tree level and then go deeper ones level by level
  const deeperImports = await secretImportDAL.findByFolderIds(importedFolderIds);
  let secretsFromDeeperImports: TSecretImportSecrets[] = [];
  if (deeperImports.length) {
    secretsFromDeeperImports = await fnSecretsFromImports({
      allowedImports: deeperImports,
      secretImportDAL,
      folderDAL,
      secretDAL,
      depth: depth + 1
    });
  }
  const secretsFromdeeperImportGroupedByFolderId = groupBy(secretsFromDeeperImports, (i) => i.importFolderId);

  const secrets = allowedImports.map(({ importPath, importEnv, id, folderId }, i) => {
    const sourceImportFolder = importedFolderGroupBySourceImport[`${importEnv.id}-${importPath}`][0];
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
