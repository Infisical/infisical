import { Knex } from "knex";

import { TSecretFolders } from "@app/db/schemas";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { ReservedFolders } from "@app/services/secret-folder/secret-folder-types";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";

export const getReplicationFolderName = (importId: string) => `${ReservedFolders.SecretReplication}${importId}`;

// Finds or creates the reserved folder a replication import writes into. Returns undefined when the
// import is gone: a job lists its imports before it waits on the replication lock, so the import can be
// deleted (and its reserved folder with it) by the time the job reaches it, and creating the folder then
// would leave an orphan that nothing removes. The import stays locked while the folder is created, so a
// delete that runs at the same time waits for this transaction and then removes the new folder.
export const findOrCreateReplicationFolder = async ({
  folderDAL,
  secretImportDAL,
  destinationSecretImportId,
  destinationFolder,
  onCreate
}: {
  folderDAL: Pick<TSecretFolderDALFactory, "findOne" | "create" | "transaction">;
  secretImportDAL: Pick<TSecretImportDALFactory, "lockWithFolderAgainstDelete">;
  destinationSecretImportId: string;
  destinationFolder: { id: string; envId: string };
  onCreate?: (folder: TSecretFolders, tx: Knex) => Promise<void>;
}) => {
  const name = getReplicationFolderName(destinationSecretImportId);
  const existingFolder = await folderDAL.findOne({ parentId: destinationFolder.id, name, isReserved: true });
  if (existingFolder) return existingFolder;

  return folderDAL.transaction(async (tx) => {
    const destinationSecretImport = await secretImportDAL.lockWithFolderAgainstDelete(
      { importId: destinationSecretImportId, folderId: destinationFolder.id, envId: destinationFolder.envId },
      tx
    );
    if (!destinationSecretImport) return undefined;

    const folder = await folderDAL.findOne({ parentId: destinationFolder.id, name, isReserved: true }, tx);
    if (folder) return folder;

    const createdFolder = await folderDAL.create(
      { parentId: destinationFolder.id, name, envId: destinationFolder.envId, isReserved: true },
      tx
    );
    // Same transaction, otherwise a retry finds the folder already there and never emits.
    if (onCreate) await onCreate(createdFolder, tx);
    return createdFolder;
  });
};
