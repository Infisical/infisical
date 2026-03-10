import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TInfraStateDALFactory = ReturnType<typeof infraStateDALFactory>;

export const infraStateDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.InfraState);
  return orm;
};
