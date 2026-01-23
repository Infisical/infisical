import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TMembershipRoleDALFactory = ReturnType<typeof membershipRoleDALFactory>;

export const membershipRoleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.MembershipRole);
  return orm;
};
