import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityProjectAdditionalPrivilegeV2DALFactory = ReturnType<
  typeof identityProjectAdditionalPrivilegeV2DALFactory
>;

export const identityProjectAdditionalPrivilegeV2DALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.IdentityProjectAdditionalPrivilege);
  return orm;
};
