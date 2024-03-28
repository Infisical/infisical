import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityProjectAdditionalPrivilegeDALFactory = ReturnType<
  typeof identityProjectAdditionalPrivilegeDALFactory
>;

export const identityProjectAdditionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.IdentityProjectAdditionalPrivilege);
  return orm;
};
