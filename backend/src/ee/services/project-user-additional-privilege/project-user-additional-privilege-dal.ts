import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectUserAdditionalPrivilegeDALFactory = ReturnType<typeof projectUserAdditionalPrivilegeDALFactory>;

export const projectUserAdditionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectUserAdditionalPrivilege);
  return orm;
};
