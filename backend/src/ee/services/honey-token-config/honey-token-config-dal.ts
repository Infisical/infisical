import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type THoneyTokenConfigDALFactory = ReturnType<typeof honeyTokenConfigDALFactory>;

export const honeyTokenConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.HoneyTokenConfig);
  return orm;
};
