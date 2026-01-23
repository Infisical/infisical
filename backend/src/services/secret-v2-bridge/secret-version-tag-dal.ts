import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSecretVersionV2TagDALFactory = ReturnType<typeof secretVersionV2TagBridgeDALFactory>;

export const secretVersionV2TagBridgeDALFactory = (db: TDbClient) => {
  const secretVersionTagDAL = ormify(db, TableName.SecretVersionV2Tag);
  return secretVersionTagDAL;
};
