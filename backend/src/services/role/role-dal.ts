import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TRoleDALFactory = ReturnType<typeof roleDALFactory>;

export const roleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Role);
  return orm;
};
