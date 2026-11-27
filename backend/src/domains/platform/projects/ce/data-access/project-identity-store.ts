import { Knex } from "knex";

import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { toCount, TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { TIdentityOwnership } from "@app/domains/platform/organizations/ce/module";
import { DatabaseError } from "@app/lib/errors";

import { TProjectIdentityStore } from "../services/dependencies";

// Reads tables another domain will own later (see ../../AGENTS.md).
export class ProjectIdentityStore implements TProjectIdentityStore {
  constructor(private readonly connection: TStoreConnection) {}

  async countProjectIdentities(
    projectType: ProjectType,
    orgId: string | null,
    options?: TReadOptions
  ): Promise<number> {
    try {
      const knex = this.connection.reader(options);
      const row = (await knex
        .count("* as count")
        .from(ProjectIdentityStore.projectIdentityEntities(knex, projectType, orgId).as("project_identities"))
        .first()) as { count?: string | number } | undefined;
      return toCount(row?.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountProjectIdentities" });
    }
  }

  async countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<{ users: number; identities: number }> {
    try {
      const knex = this.connection.reader(options);
      const rows = (await knex
        .select("kind")
        .count("* as count")
        .from(ProjectIdentityStore.projectIdentityEntities(knex, projectType, orgId).as("project_identities"))
        .groupBy("kind")) as { kind: string; count: string | number }[];

      const byKind = (kind: string) => toCount(rows.find((row) => row.kind === kind)?.count);
      return { users: byKind("u"), identities: byKind("i") };
    } catch (error) {
      throw new DatabaseError({ error, name: "CountProjectIdentitiesByKind" });
    }
  }

  // Grouped by owner (identities.projectId, or the org), not membership: an identity can be in many projects but
  // has one owner, so the total splits exactly once.
  async getProjectIdentityOwnershipBreakdown(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<TIdentityOwnership[]> {
    try {
      const knex = this.connection.reader(options);
      const rows = (await knex({ i: TableName.Identity })
        .whereIn(
          "i.id",
          knex
            .select("entityId")
            .from(ProjectIdentityStore.projectIdentityEntities(knex, projectType, orgId).as("project_identities"))
            .where("kind", "i")
        )
        .groupBy("i.orgId", "i.projectId")
        .select({ orgId: "i.orgId", projectId: "i.projectId" })
        .count("i.id as count")) as { orgId: string; projectId: string | null; count: string | number }[];

      return rows.map((row) => ({ orgId: row.orgId, projectId: row.projectId, count: toCount(row.count) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectIdentityOwnershipBreakdown" });
    }
  }

  // Shared by the meter and the usage breakdown so they can't disagree. Shaped to hit the partial unique indexes.
  // Pending group members (invited, not joined) don't take a seat.
  private static projectIdentityEntities(db: Knex, projectType: ProjectType, orgId?: string | null) {
    const scopedOrgIds = () => {
      const qb = db(TableName.Organization).select(`${TableName.Organization}.id`);
      if (orgId) {
        void qb.where((bd) => {
          void bd.where(`${TableName.Organization}.id`, orgId).orWhere(`${TableName.Organization}.rootOrgId`, orgId);
        });
      }
      return qb;
    };

    const typedProjectIds = () => {
      const qb = db(TableName.Project)
        .where(`${TableName.Project}.type`, projectType)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(`${TableName.Project}.id`);
      if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, scopedOrgIds());
      return qb;
    };

    const orgMemberUserIds = () => {
      const qb = db(TableName.Membership)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where(`${TableName.Users}.isGhost`, false)
        .where(`${TableName.Users}.isAccepted`, true)
        .select(`${TableName.Membership}.actorUserId`);
      if (orgId) void qb.whereIn(`${TableName.Membership}.scopeOrgId`, scopedOrgIds());
      return qb;
    };

    const orgIdentityIds = () => {
      const qb = db(TableName.Identity).select(`${TableName.Identity}.id`);
      if (orgId) void qb.whereIn(`${TableName.Identity}.orgId`, scopedOrgIds());
      return qb;
    };

    const directUsers = db(TableName.Membership)
      .where(`${TableName.Membership}.scope`, AccessScope.Project)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
      .whereIn(`${TableName.Membership}.actorUserId`, orgMemberUserIds())
      .select(db.raw("'u' as kind"))
      .select(`${TableName.Membership}.actorUserId as entityId`);

    return directUsers.union(
      [
        (qb) =>
          void qb
            .from(TableName.Membership)
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .whereNotNull(`${TableName.Membership}.actorIdentityId`)
            .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
            .whereIn(`${TableName.Membership}.actorIdentityId`, orgIdentityIds())
            .select(db.raw("'i' as kind"))
            .select(`${TableName.Membership}.actorIdentityId as entityId`),
        (qb) =>
          void qb
            .from(TableName.UserGroupMembership)
            .join(
              TableName.Membership,
              `${TableName.UserGroupMembership}.groupId`,
              `${TableName.Membership}.actorGroupId`
            )
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .where(`${TableName.UserGroupMembership}.isPending`, false)
            .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
            .whereIn(`${TableName.UserGroupMembership}.userId`, orgMemberUserIds())
            .select(db.raw("'u' as kind"))
            .select(`${TableName.UserGroupMembership}.userId as entityId`),
        (qb) =>
          void qb
            .from(TableName.IdentityGroupMembership)
            .join(
              TableName.Membership,
              `${TableName.IdentityGroupMembership}.groupId`,
              `${TableName.Membership}.actorGroupId`
            )
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
            .whereIn(`${TableName.IdentityGroupMembership}.identityId`, orgIdentityIds())
            .select(db.raw("'i' as kind"))
            .select(`${TableName.IdentityGroupMembership}.identityId as entityId`)
      ],
      true
    );
  }
}
