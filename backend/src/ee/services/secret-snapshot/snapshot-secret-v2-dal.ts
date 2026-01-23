import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSnapshotSecretV2DALFactory = ReturnType<typeof snapshotSecretV2DALFactory>;

export const snapshotSecretV2DALFactory = (db: TDbClient) => {
  const snapshotSecretOrm = ormify(db, TableName.SnapshotSecretV2);
  return snapshotSecretOrm;
};
