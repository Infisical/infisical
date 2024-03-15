import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityProjectMembershipRoleDALFactory = ReturnType<typeof identityProjectMembershipRoleDALFactory>;

export const identityProjectMembershipRoleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.IdentityProjectMembershipRole);
  return orm;
};
