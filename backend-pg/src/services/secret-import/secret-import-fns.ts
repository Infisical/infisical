import { SecretType, TSecretImports } from "@app/db/schemas";
import { groupBy } from "@app/lib/fn";

import { TSecretDalFactory } from "../secret/secret-dal";
import { TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";

export const fnSecretsFromImports = async ({
  allowedImports,
  folderDal,
  secretDal
}: {
  allowedImports: (Omit<TSecretImports, "importEnv"> & {
    importEnv: { id: string; slug: string; name: string };
  })[];
  folderDal: Pick<TSecretFolderDalFactory, "findByManySecretPath">;
  secretDal: Pick<TSecretDalFactory, "find">;
}) => {
  const importedFolders = await folderDal.findByManySecretPath(
    allowedImports.map(({ importEnv, importPath }) => ({
      envId: importEnv.id,
      secretPath: importPath
    }))
  );
  const folderIds = importedFolders.map((el) => el?.id).filter(Boolean) as string[];
  if (!folderIds.length) {
    return [];
  }
  const importedSecrets = await secretDal.find({
    $in: { folderId: folderIds },
    type: SecretType.Shared
  });

  const importedSecsGroupByFolderId = groupBy(importedSecrets, (i) => i.folderId);
  return allowedImports.map(({ importPath, importEnv }, i) => ({
    secretPath: importPath,
    environment: importEnv.slug,
    environmentInfo: importEnv,
    folderId: importedFolders?.[i]?.id,
    secrets: importedFolders?.[i]?.id
      ? importedSecsGroupByFolderId[importedFolders?.[i]?.id as string]
      : []
  }));
};
