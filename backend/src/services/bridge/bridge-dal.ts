import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TBridgeDALFactory = ReturnType<typeof bridgeDALFactory>;

export const bridgeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Bridge);
  return { ...orm };
};
