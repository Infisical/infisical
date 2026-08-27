import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TIdentityGroupMembershipDALFactory = ReturnType<typeof identityGroupMembershipDALFactory>;

export const identityGroupMembershipDALFactory = (db: TDbClient) => {
  const identityGroupMembershipOrm = ormify(db, TableName.IdentityGroupMembership);

  /**
   * Returns a sub-set of projectIds fed into this function corresponding to projects where either:
   * - The identity is a direct member of the project.
   * - The identity is a member of a group that is a member of the project, excluding projects that they are part of
   * through the group with id [groupId].
   */
  const filterProjectsByIdentityMembership = async (
    identityId: string,
    groupId: string,
    projectIds: string[],
    tx?: Knex
  ) => {
    try {
      const identityProjectMemberships: string[] = await (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.actorIdentityId`, identityId)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereIn(`${TableName.Membership}.scopeProjectId`, projectIds)
        .pluck(`${TableName.Membership}.scopeProjectId`);

      const identityGroupMemberships: string[] = await (tx || db.replicaNode())(TableName.IdentityGroupMembership)
        .where(`${TableName.IdentityGroupMembership}.identityId`, identityId)
        .whereNot(`${TableName.IdentityGroupMembership}.groupId`, groupId)
        .join(
          TableName.Membership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.Membership}.actorGroupId`
        )
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereIn(`${TableName.Membership}.scopeProjectId`, projectIds)
        .pluck(`${TableName.Membership}.scopeProjectId`);

      return new Set(identityProjectMemberships.concat(identityGroupMemberships));
    } catch (error) {
      throw new DatabaseError({ error, name: "Filter projects by identity membership" });
    }
  };

  return {
    ...identityGroupMembershipOrm,
    filterProjectsByIdentityMembership
  };
};
