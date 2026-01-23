import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSnapshotSecretDALFactory = ReturnType<typeof snapshotSecretDALFactory>;

export const snapshotSecretDALFactory = (db: TDbClient) => {
  const snapshotSecretOrm = ormify(db, TableName.SnapshotSecret);
  return snapshotSecretOrm;
};
