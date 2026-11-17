import path from "node:path";

import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";

import { ReservedFolders } from "./secret-folder-types";

export const isReservedFolderName = (name: string) => name.startsWith(ReservedFolders.SecretReplication);

export const assertFolderNameNotReserved = (name: string) => {
  if (isReservedFolderName(name)) {
    throw new BadRequestError({
      message: `Folder names can't start with '${ReservedFolders.SecretReplication}'. That prefix is reserved for secret replication.`
    });
  }
};

// The path is checked as well as the flag, so a folder nested under a replication folder is refused too.
export const assertFolderNotReserved = (folder: { isReserved?: boolean | null; path?: string | null }) => {
  const isUnderReservedFolder = (folder.path ?? "").split("/").some((segment) => isReservedFolderName(segment));
  if (folder.isReserved || isUnderReservedFolder) {
    throw new BadRequestError({
      message: `${folder.path ? `Folder '${folder.path}'` : "This folder"} is managed by secret replication and can't be changed directly. Change the source folder instead.`
    });
  }
};

// Readers find a replication import's copy through the reserved import row's importPath, so a rename above
// the destination folder must move that path with it or the import reads an empty folder.
export const rewriteReservedImportPaths = async (
  { envId, oldPath, newPath }: { envId: string; oldPath: string; newPath: string },
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "updateById">,
  tx?: Knex
) => {
  if (oldPath === newPath) return;

  const prefix = `${removeTrailingSlash(oldPath)}/`;
  const reservedImports = await secretImportDAL.find(
    {
      [`${TableName.SecretImport}.importEnv` as "importEnv"]: envId,
      [`${TableName.SecretImport}.isReserved` as "isReserved"]: true
    },
    tx
  );
  await Promise.all(
    reservedImports
      .filter(({ importPath }) => importPath.startsWith(prefix))
      .map(({ id, importPath }) =>
        secretImportDAL.updateById(id, { importPath: path.posix.join(newPath, importPath.slice(prefix.length)) }, tx)
      )
  );
};
