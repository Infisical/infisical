import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TInfraRunDALFactory = ReturnType<typeof infraRunDALFactory>;

export const infraRunDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.InfraRun);
  return orm;
};
