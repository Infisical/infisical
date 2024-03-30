import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectUserMembershipRoleDALFactory = ReturnType<typeof projectUserMembershipRoleDALFactory>;

export const projectUserMembershipRoleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectUserMembershipRole);
  return orm;
};
