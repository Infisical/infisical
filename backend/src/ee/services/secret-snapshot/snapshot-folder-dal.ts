import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSnapshotFolderDALFactory = ReturnType<typeof snapshotFolderDALFactory>;

export const snapshotFolderDALFactory = (db: TDbClient) => {
  const snapshotFolderOrm = ormify(db, TableName.SnapshotFolder);

  return snapshotFolderOrm;
};
