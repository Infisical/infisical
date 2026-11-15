import { Knex } from "knex";

import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { toCount } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { TBillableActorStore, TIdentityOwnership } from "../services/dependencies";

// Billable = org member in a Secret Manager/KMS project or in no project at all (direct or via a group).
// Actors only in PAM, PKI etc. don't count.
const COUNTED_PROJECT_TYPES = [ProjectType.SecretManager, ProjectType.KMS];

// Reads tables a future domain will own; see ../../AGENTS.md.
export class BillableActorStore implements TBillableActorStore {
  // A source, not a handle: replicaNode() picks a replica per call, and the stores bundle passes its transaction.
  constructor(private readonly knex: () => Knex) {}

  async countBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number }> {
    try {
      const knex = this.knex();

      const row = (await this.withBillableScopes(orgId)
        .with("counted_members", this.countedMembersCte())
        .with("projectless_users", this.projectlessUsersCte())
        .with("projectless_identities", this.projectlessIdentitiesCte())
        .select(
          knex.raw("(select count(*) from counted_members where kind = 'u') as counted_users"),
          knex.raw("(select count(*) from counted_members where kind = 'i') as counted_identities"),
          knex.raw("(select count(*) from projectless_users) as projectless_users"),
          knex.raw("(select count(*) from projectless_identities) as projectless_identities")
        )
        .first()) as
        | {
            counted_users?: string | number;
            counted_identities?: string | number;
            projectless_users?: string | number;
            projectless_identities?: string | number;
          }
        | undefined;

      return {
        users: toCount(row?.counted_users) + toCount(row?.projectless_users),
        identities: toCount(row?.counted_identities) + toCount(row?.projectless_identities)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "CountBillableOrgActors" });
    }
  }

  // Attributed by where each identity was created, not by membership: an identity can sit in many
  // projects, but identities.projectId is one column, so the billed total splits exactly once.
  async getBillableIdentityOwnershipBreakdown(orgId: string | null): Promise<TIdentityOwnership[]> {
    try {
      const knex = this.knex();

      const rows = (await this.withBillableScopes(orgId)
        .with("counted_members", this.countedMembersCte())
        .with("projectless_identities", this.projectlessIdentitiesCte())
        .with("billable_identities", (qb) => {
          void qb
            .select("entityId as id")
            .from("counted_members")
            .where("kind", "i")
            .union((u) => void u.select("id").from("projectless_identities"), true);
        })
        .from({ i: TableName.Identity })
        .whereIn("i.id", knex.select("id").from("billable_identities"))
        .groupBy("i.orgId", "i.projectId")
        .select({ orgId: "i.orgId", projectId: "i.projectId" })
        .count("i.id as count")) as { orgId: string; projectId: string | null; count: string | number }[];

      return rows.map((row) => ({ orgId: row.orgId, projectId: row.projectId, count: toCount(row.count) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "GetBillableIdentityOwnershipBreakdown" });
    }
  }

  async countProjectIdentities(projectType: ProjectType, orgId: string | null): Promise<number> {
    try {
      const row = (await this.knex()
        .count("* as count")
        .from(this.projectIdentityEntities(projectType, orgId).as("project_identities"))
        .first()) as { count?: string | number } | undefined;
      return toCount(row?.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountProjectIdentities" });
    }
  }

  async countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string
  ): Promise<{ users: number; identities: number }> {
    try {
      const rows = (await this.knex()
        .select("kind")
        .count("* as count")
        .from(this.projectIdentityEntities(projectType, orgId).as("project_identities"))
        .groupBy("kind")) as { kind: string; count: string | number }[];

      const byKind = (kind: string) => toCount(rows.find((row) => row.kind === kind)?.count);
      return { users: byKind("u"), identities: byKind("i") };
    } catch (error) {
      throw new DatabaseError({ error, name: "CountProjectIdentitiesByKind" });
    }
  }

  // Attributed by owner (project, or the org when org-owned), not membership, for the same reason as above.
  async getProjectIdentityOwnershipBreakdown(projectType: ProjectType, orgId?: string): Promise<TIdentityOwnership[]> {
    try {
      const rows = (await this.knex()({ i: TableName.Identity })
        .whereIn(
          "i.id",
          this.knex()
            .select("entityId")
            .from(this.projectIdentityEntities(projectType, orgId).as("project_identities"))
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

  private withBillableScopes(orgId: string | null) {
    const knex = this.knex();
    const orgIds = orgId
      ? knex
          .select("id")
          .from(TableName.Organization)
          .where("id", orgId)
          .union((qb) => void qb.select("id").from(TableName.Organization).where("rootOrgId", orgId), true)
      : knex.select("id").from(TableName.Organization);

    return knex
      .with("orgs", orgIds)
      .with("counted_projects", (qb) => {
        void qb
          .from(TableName.Project)
          .whereNull("deleteAfter")
          .whereIn("type", COUNTED_PROJECT_TYPES)
          .whereIn("orgId", knex.select("id").from("orgs"))
          .select("id");
      })
      .with("all_projects", (qb) => {
        void qb
          .from(TableName.Project)
          .whereNull("deleteAfter")
          .whereIn("orgId", knex.select("id").from("orgs"))
          .select("id");
      })
      .with("org_users", (qb) => {
        void qb
          .from({ m: TableName.Membership })
          .join({ u: TableName.Users }, "u.id", "m.actorUserId")
          .where("m.scope", AccessScope.Organization)
          .whereIn("m.scopeOrgId", knex.select("id").from("orgs"))
          .whereNotNull("m.actorUserId")
          .where("u.isGhost", false)
          .where("u.isAccepted", true)
          .distinct({ id: "m.actorUserId" });
      })
      .with("org_identities", (qb) => {
        void qb.from(TableName.Identity).whereIn("orgId", knex.select("id").from("orgs")).distinct("id");
      });
  }

  // UNION dedupes across the four sources; kind ('u'/'i') lets the caller split by actor type.
  private countedMembersCte() {
    const knex = this.knex();
    return (qb: Knex.QueryBuilder) => {
      void qb.distinct("kind", "entityId").from(
        knex
          .from({ m: TableName.Membership })
          .where("m.scope", AccessScope.Project)
          .whereNotNull("m.actorUserId")
          .whereIn("m.scopeProjectId", knex.select("id").from("counted_projects"))
          .whereIn("m.actorUserId", knex.select("id").from("org_users"))
          .select(knex.raw("'u' as kind"), { entityId: "m.actorUserId" })
          .union(
            [
              (u) => {
                void u
                  .from({ m: TableName.Membership })
                  .where("m.scope", AccessScope.Project)
                  .whereNotNull("m.actorIdentityId")
                  .whereIn("m.scopeProjectId", knex.select("id").from("counted_projects"))
                  .whereIn("m.actorIdentityId", knex.select("id").from("org_identities"))
                  .select(knex.raw("'i' as kind"), { entityId: "m.actorIdentityId" });
              },
              (u) => {
                void u
                  .from({ ugm: TableName.UserGroupMembership })
                  .join({ mg: TableName.Membership }, "mg.actorGroupId", "ugm.groupId")
                  .where("mg.scope", AccessScope.Project)
                  .where("ugm.isPending", false)
                  .whereIn("mg.scopeProjectId", knex.select("id").from("counted_projects"))
                  .whereIn("ugm.userId", knex.select("id").from("org_users"))
                  .select(knex.raw("'u' as kind"), { entityId: "ugm.userId" });
              },
              (u) => {
                void u
                  .from({ igm: TableName.IdentityGroupMembership })
                  .join({ mg: TableName.Membership }, "mg.actorGroupId", "igm.groupId")
                  .where("mg.scope", AccessScope.Project)
                  .whereIn("mg.scopeProjectId", knex.select("id").from("counted_projects"))
                  .whereIn("igm.identityId", knex.select("id").from("org_identities"))
                  .select(knex.raw("'i' as kind"), { entityId: "igm.identityId" });
              }
            ],
            true
          )
          .as("cm")
      );
    };
  }

  // Org users with no project membership at all (direct or via a group) still count.
  private projectlessUsersCte() {
    const knex = this.knex();
    return (qb: Knex.QueryBuilder) => {
      void qb
        .from({ ou: "org_users" })
        .whereNotExists((w) => {
          void w
            .from({ m: TableName.Membership })
            .where("m.scope", AccessScope.Project)
            .whereRaw('m."actorUserId" = ou.id')
            .whereIn("m.scopeProjectId", knex.select("id").from("all_projects"));
        })
        .whereNotExists((w) => {
          void w
            .from({ ugm: TableName.UserGroupMembership })
            .join({ mg: TableName.Membership }, "mg.actorGroupId", "ugm.groupId")
            .where("mg.scope", AccessScope.Project)
            .where("ugm.isPending", false)
            .whereRaw('ugm."userId" = ou.id')
            .whereIn("mg.scopeProjectId", knex.select("id").from("all_projects"));
        })
        .select("ou.id");
    };
  }

  private projectlessIdentitiesCte() {
    const knex = this.knex();
    return (qb: Knex.QueryBuilder) => {
      void qb
        .from({ oi: "org_identities" })
        .whereNotExists((w) => {
          void w
            .from({ m: TableName.Membership })
            .where("m.scope", AccessScope.Project)
            .whereRaw('m."actorIdentityId" = oi.id')
            .whereIn("m.scopeProjectId", knex.select("id").from("all_projects"));
        })
        .whereNotExists((w) => {
          void w
            .from({ igm: TableName.IdentityGroupMembership })
            .join({ mg: TableName.Membership }, "mg.actorGroupId", "igm.groupId")
            .where("mg.scope", AccessScope.Project)
            .whereRaw('igm."identityId" = oi.id')
            .whereIn("mg.scopeProjectId", knex.select("id").from("all_projects"));
        })
        .select("oi.id");
    };
  }

  // Shared by the meter and the usage breakdown so the breakdown can't disagree with what gets billed.
  // Shaped to hit the partial unique indexes. Pending group members (invited, not joined) don't take a seat.
  private projectIdentityEntities(projectType: ProjectType, orgId?: string | null) {
    const db = this.knex;
    const scopedOrgIds = () => {
      const qb = db()(TableName.Organization).select(`${TableName.Organization}.id`);
      if (orgId) {
        void qb.where((bd) => {
          void bd.where(`${TableName.Organization}.id`, orgId).orWhere(`${TableName.Organization}.rootOrgId`, orgId);
        });
      }
      return qb;
    };

    const typedProjectIds = () => {
      const qb = db()(TableName.Project)
        .where(`${TableName.Project}.type`, projectType)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(`${TableName.Project}.id`);
      if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, scopedOrgIds());
      return qb;
    };

    const orgMemberUserIds = () => {
      const qb = db()(TableName.Membership)
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
      const qb = db()(TableName.Identity).select(`${TableName.Identity}.id`);
      if (orgId) void qb.whereIn(`${TableName.Identity}.orgId`, scopedOrgIds());
      return qb;
    };

    const directUsers = db()(TableName.Membership)
      .where(`${TableName.Membership}.scope`, AccessScope.Project)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
      .whereIn(`${TableName.Membership}.actorUserId`, orgMemberUserIds())
      .select(db().raw("'u' as kind"))
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
            .select(db().raw("'i' as kind"))
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
            .select(db().raw("'u' as kind"))
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
            .select(db().raw("'i' as kind"))
            .select(`${TableName.IdentityGroupMembership}.identityId as entityId`)
      ],
      true
    );
  }
}
