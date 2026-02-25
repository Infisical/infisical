import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TInfraFileDALFactory = ReturnType<typeof infraFileDALFactory>;

export const infraFileDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.InfraFile);
  return orm;
};
