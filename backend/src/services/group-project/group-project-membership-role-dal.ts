import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TGroupProjectMembershipRoleDALFactory = ReturnType<typeof groupProjectMembershipRoleDALFactory>;

export const groupProjectMembershipRoleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GroupProjectMembershipRole);
  return orm;
};
