import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityGroupProjectMembershipRoleDALFactory = ReturnType<
  typeof identityGroupProjectMembershipRoleDALFactory
>;

export const identityGroupProjectMembershipRoleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.IdentityGroupProjectMembershipRole);
  return orm;
};
