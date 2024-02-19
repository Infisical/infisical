import { SecretType, TSecretImports } from "@app/db/schemas";
import { groupBy } from "@app/lib/fn";

import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";

export const fnSecretsFromImports = async ({
  allowedImports,
  folderDAL,
  secretDAL
}: {
  allowedImports: (Omit<TSecretImports, "importEnv"> & {
    importEnv: { id: string; slug: string; name: string };
  })[];
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath">;
  secretDAL: Pick<TSecretDALFactory, "find">;
}) => {
  const importedFolders = await folderDAL.findByManySecretPath(
    allowedImports.map(({ importEnv, importPath }) => ({
      envId: importEnv.id,
      secretPath: importPath
    }))
  );
  const folderIds = importedFolders.map((el) => el?.id).filter(Boolean) as string[];
  if (!folderIds.length) {
    return [];
  }
  const importedSecrets = await secretDAL.find(
    {
      $in: { folderId: folderIds },
      type: SecretType.Shared
    },
    {
      sort: [["id", "asc"]]
    }
  );

  const importedSecsGroupByFolderId = groupBy(importedSecrets, (i) => i.folderId);
  return allowedImports.map(({ importPath, importEnv }, i) => ({
    secretPath: importPath,
    environment: importEnv.slug,
    environmentInfo: importEnv,
    folderId: importedFolders?.[i]?.id,
    // this will ensure for cases when secrets are empty. Could be due to missing folder for a path or when emtpy secrets inside a given path
    secrets: (importedSecsGroupByFolderId?.[importedFolders?.[i]?.id as string] || []).map((item) => ({
      ...item,
      environment: importEnv.slug,
      workspace: "", // This field should not be used, it's only here to keep the older Python SDK versions backwards compatible with the new Postgres backend.
      _id: item.id // The old Python SDK depends on the _id field being returned. We return this to keep the older Python SDK versions backwards compatible with the new Postgres backend.
    }))
  }));
};
