import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TIdentityGroupMembershipDALFactory = ReturnType<typeof identityGroupMembershipDALFactory>;

export const identityGroupMembershipDALFactory = (db: TDbClient) => {
  const identityGroupMembershipOrm = ormify(db, TableName.IdentityGroupMembership);

  /**
   * For the given identities, returns the subset of [projectIds] each still reaches via either:
   * - a direct project membership, or
   * - membership in a group other than [groupId] that is itself a member of the project.
   */
  const filterProjectsByIdentityMembership = async (
    identityIds: string[],
    groupId: string,
    projectIds: string[],
    tx?: Knex
  ) => {
    const stillReach = new Map<string, Set<string>>();
    if (!identityIds.length || !projectIds.length) return stillReach;

    try {
      const knex = tx || db.replicaNode();

      // Two queries instead of UNION: Knex compiles whereIn arrays inside
      // queryBuilder().union() as `IN $n` without parentheses, which Postgres rejects.
      const directRows = (await knex(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereIn(`${TableName.Membership}.actorIdentityId`, identityIds)
        .whereIn(`${TableName.Membership}.scopeProjectId`, projectIds)
        .select(
          db.ref("actorIdentityId").withSchema(TableName.Membership).as("identityId"),
          db.ref("scopeProjectId").withSchema(TableName.Membership).as("projectId")
        )) as { identityId: string; projectId: string }[];

      const viaOtherGroupRows = (await knex(TableName.IdentityGroupMembership)
        .whereIn(`${TableName.IdentityGroupMembership}.identityId`, identityIds)
        .whereNot(`${TableName.IdentityGroupMembership}.groupId`, groupId)
        .join(
          TableName.Membership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.Membership}.actorGroupId`
        )
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereIn(`${TableName.Membership}.scopeProjectId`, projectIds)
        .select(
          db.ref("identityId").withSchema(TableName.IdentityGroupMembership),
          db.ref("scopeProjectId").withSchema(TableName.Membership).as("projectId")
        )) as { identityId: string; projectId: string }[];

      for (const { identityId, projectId } of [...directRows, ...viaOtherGroupRows]) {
        let projects = stillReach.get(identityId);
        if (!projects) {
          projects = new Set();
          stillReach.set(identityId, projects);
        }
        projects.add(projectId);
      }

      return stillReach;
    } catch (error) {
      throw new DatabaseError({ error, name: "Filter projects by identity membership" });
    }
  };

  return {
    ...identityGroupMembershipOrm,
    filterProjectsByIdentityMembership
  };
};
