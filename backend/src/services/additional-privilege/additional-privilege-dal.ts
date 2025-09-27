import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAdditionalPrivilegeDALFactory = ReturnType<typeof additionalPrivilegeDALFactory>;

export const additionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AdditionalPrivilege);
  return orm;
};
