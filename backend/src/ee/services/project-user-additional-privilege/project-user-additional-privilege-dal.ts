import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TProjectUserAdditionalPrivilegeDALFactory = TOrmify<TableName.ProjectUserAdditionalPrivilege>;

export const projectUserAdditionalPrivilegeDALFactory = (db: TDbClient): TProjectUserAdditionalPrivilegeDALFactory => {
  const orm = ormify(db, TableName.ProjectUserAdditionalPrivilege);
  return orm;
};
