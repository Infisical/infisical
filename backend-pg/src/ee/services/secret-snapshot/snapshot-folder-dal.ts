import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSnapshotFolderDalFactory = ReturnType<typeof snapshotFolderDalFactory>;

export const snapshotFolderDalFactory = (db: TDbClient) => {
  const snapshotFolderOrm = ormify(db, TableName.SnapshotFolder);

  return snapshotFolderOrm;
};
