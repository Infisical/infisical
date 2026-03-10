import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TInfraVariableDALFactory = ReturnType<typeof infraVariableDALFactory>;

export const infraVariableDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.InfraVariable);
  return orm;
};
