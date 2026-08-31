import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TMembershipRoleDALFactory = ReturnType<typeof membershipRoleDALFactory>;

type TMembershipRoleSlug = {
  membershipId: string;
  role: string;
  isTemporary: boolean;
  temporaryAccessEndTime?: Date | null;
  customRoleSlug?: string | null;
};

export const membershipRoleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.MembershipRole);

  // Role rows for a set of memberships, carrying the custom-role slug rather than its id so the
  // result feeds resolveMembershipRoleSlugs directly. Batched so a bulk privilege-boundary check
  // costs one query no matter how many memberships the caller is removing.
  const findRolesByMembershipIds = async (membershipIds: string[], tx?: Knex): Promise<TMembershipRoleSlug[]> => {
    if (!membershipIds.length) return [];

    try {
      return await (tx || db.replicaNode())(TableName.MembershipRole)
        .whereIn(`${TableName.MembershipRole}.membershipId`, membershipIds)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .select(
          db.ref("membershipId").withSchema(TableName.MembershipRole),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("isTemporary").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole),
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug")
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRolesByMembershipIds" });
    }
  };

  return { ...orm, findRolesByMembershipIds };
};
