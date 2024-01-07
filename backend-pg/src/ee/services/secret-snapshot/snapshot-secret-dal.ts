import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSnapshotSecretDalFactory = ReturnType<typeof snapshotSecretDalFactory>;

export const snapshotSecretDalFactory = (db: TDbClient) => {
  const snapshotSecretOrm = ormify(db, TableName.SnapshotSecret);
  return snapshotSecretOrm;
};
