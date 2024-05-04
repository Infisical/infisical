import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TGroupProjectUserAdditionalPrivilegeDALFactory = ReturnType<
  typeof groupProjectUserAdditionalPrivilegeDALFactory
>;

export const groupProjectUserAdditionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GroupProjectUserAdditionalPrivilege);
  return orm;
};
