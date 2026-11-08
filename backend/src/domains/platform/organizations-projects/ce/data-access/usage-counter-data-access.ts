import { Knex } from "knex";

import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

// A user/identity occupies a billable seat only when it is (a) an org member, and (b) either a member
// of a Secret-Management-flavoured project (Secret Manager or KMS) or not a member of any project at
// all. Actors that only live in other project types (PAM, PKI, ...) do not count. Membership can be
// direct or inherited through a group.
const COUNTED_PROJECT_TYPES = [ProjectType.SecretManager, ProjectType.KMS];

// One metered machine identity resolved to where it was created: the project that owns it, or the org
// itself (projectId null) when it is org-owned.
export type TIdentityOwnershipRow = { orgId: string; projectId: string | null; count: number };

const toCount = (row: unknown): number => Number((row as { count?: string | number } | undefined)?.count ?? 0);

// The orgs in scope (the org and its sub-orgs, or every org), their live projects, their accepted
// non-ghost users, and their identities.
const withBillableScopes = (knex: Knex, orgId: string | null) => {
  const orgIds = orgId
    ? knex
        .select("id")
        .from(TableName.Organization)
        .where("id", orgId)
        .union((qb) => void qb.select("id").from(TableName.Organization).where("rootOrgId", orgId), true)
    : knex.select("id").from(TableName.Organization);

  return (
    knex
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
      // Identities that belong to an org in scope, deduped.
      .with("org_identities", (qb) => {
        void qb.from(TableName.Identity).whereIn("orgId", knex.select("id").from("orgs")).distinct("id");
      })
  );
};

// Actors present in at least one counted (SM/KMS) project, direct or via a group. UNION dedupes
// across the four sources, and kind ('u'/'i') lets the caller split by actor type.
const countedMembersCte = (knex: Knex) => {
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
};

// Org users with no project membership at all (direct or via a group) count as present in the org.
const projectlessUsersCte = (knex: Knex) => {
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
};

const projectlessIdentitiesCte = (knex: Knex) => {
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
};

// The distinct actor set behind the project-scoped identity meters, as ('u' | 'i', entityId) rows.
// Shared by the meter and the usage breakdown so a breakdown can never disagree with the number the
// customer is billed on.
const projectIdentityEntities = (knex: Knex, projectType: ProjectType, orgId?: string) => {
  const scopedOrgIds = () => {
    const qb = knex(TableName.Organization).select(`${TableName.Organization}.id`);
    if (orgId) {
      void qb.where((bd) => {
        void bd.where(`${TableName.Organization}.id`, orgId).orWhere(`${TableName.Organization}.rootOrgId`, orgId);
      });
    }
    return qb;
  };

  const typedProjectIds = () => {
    const qb = knex(TableName.Project)
      .where(`${TableName.Project}.type`, projectType)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .select(`${TableName.Project}.id`);
    if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, scopedOrgIds());
    return qb;
  };

  const orgMemberUserIds = () => {
    const qb = knex(TableName.Membership)
      .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
      .where(`${TableName.Membership}.scope`, AccessScope.Organization)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .where(`${TableName.Users}.isGhost`, false)
      .where(`${TableName.Users}.isAccepted`, true)
      .select(`${TableName.Membership}.actorUserId`);
    if (orgId) void qb.whereIn(`${TableName.Membership}.scopeOrgId`, scopedOrgIds());
    return qb;
  };

  // Identities that actually belong to the org / child orgs.
  const orgIdentityIds = () => {
    const qb = knex(TableName.Identity).select(`${TableName.Identity}.id`);
    if (orgId) void qb.whereIn(`${TableName.Identity}.orgId`, scopedOrgIds());
    return qb;
  };

  // scope = project + a non-null actor column + whereIn against the typed project ids matches the
  // partial unique indexes exactly; each project-scope row carries exactly one actor column.
  const directUsers = knex(TableName.Membership)
    .where(`${TableName.Membership}.scope`, AccessScope.Project)
    .whereNotNull(`${TableName.Membership}.actorUserId`)
    .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
    .whereIn(`${TableName.Membership}.actorUserId`, orgMemberUserIds())
    .select(knex.raw("'u' as kind"))
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
          .select(knex.raw("'i' as kind"))
          .select(`${TableName.Membership}.actorIdentityId as entityId`),
      // A group assigned to a project (membership with actorGroupId) brings its members into it. A
      // pending group membership (invited, not yet joined) does not occupy a seat.
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
          .select(knex.raw("'u' as kind"))
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
          .select(knex.raw("'i' as kind"))
          .select(`${TableName.IdentityGroupMembership}.identityId as entityId`)
    ],
    true
  );
};

// Reads tables a future domain will own (memberships, group memberships, users, identities, projects,
// organizations); see ../../AGENTS.md.
export class BillableActorDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  // Billable users and machine identities. A null orgId counts the whole instance.
  async countBillableOrgActors(
    orgId: string | null,
    options?: TReadOptions
  ): Promise<{ users: number; identities: number }> {
    const knex = this.db.reader(options);
    try {
      const row = (await withBillableScopes(knex, orgId)
        .with("counted_members", countedMembersCte(knex))
        .with("projectless_users", projectlessUsersCte(knex))
        .with("projectless_identities", projectlessIdentitiesCte(knex))
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
        users: Number(row?.counted_users ?? 0) + Number(row?.projectless_users ?? 0),
        identities: Number(row?.counted_identities ?? 0) + Number(row?.projectless_identities ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "CountBillableOrgActors" });
    }
  }

  // The same seats countBillableOrgActors bills for, attributed to where each machine identity was
  // created. Seats are held by membership (an identity can sit in many projects), so grouping on
  // membership would count one identity several times; identities.projectId is a single column, so
  // grouping on ownership partitions the billed total exactly once across the tree.
  // orgId null means the whole instance, matching countBillableOrgActors and the meter it feeds.
  async getBillableIdentityOwnershipBreakdown(
    orgId: string | null,
    options?: TReadOptions
  ): Promise<TIdentityOwnershipRow[]> {
    const knex = this.db.reader(options);
    try {
      const rows = (await withBillableScopes(knex, orgId)
        .with("counted_members", countedMembersCte(knex))
        .with("projectless_identities", projectlessIdentitiesCte(knex))
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

      return rows.map((row) => ({ orgId: row.orgId, projectId: row.projectId, count: Number(row.count) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "GetBillableIdentityOwnershipBreakdown" });
    }
  }

  // Users and machine identities in projects of one type, directly or through a group. orgId omitted counts
  // the whole instance.
  async countProjectIdentities(projectType: ProjectType, orgId?: string, options?: TReadOptions): Promise<number> {
    const knex = this.db.reader(options);
    // .as() on a union builder is typed as any, so cast the awaited row before counting.
    const row = (await knex
      .count("* as count")
      .from(projectIdentityEntities(knex, projectType, orgId).as("project_identities"))
      .first()) as { count?: string | number } | undefined;
    return toCount(row);
  }

  async countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<{ users: number; identities: number }> {
    const knex = this.db.reader(options);
    const rows = (await knex
      .select("kind")
      .count("* as count")
      .from(projectIdentityEntities(knex, projectType, orgId).as("project_identities"))
      .groupBy("kind")) as { kind: string; count: string | number }[];

    const byKind = (kind: string) => Number(rows.find((row) => row.kind === kind)?.count ?? 0);
    return { users: byKind("u"), identities: byKind("i") };
  }

  // Machine identities from the same metered set, attributed to where each was created: the project
  // that owns it, or the org itself when org-owned. Seats are held by membership, which is
  // many-to-many, so grouping on membership would count one identity once per project it sits in;
  // identities.projectId is a single column and partitions the metered total exactly once.
  async getProjectIdentityOwnershipBreakdown(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<TIdentityOwnershipRow[]> {
    const knex = this.db.reader(options);
    const rows = (await knex({ i: TableName.Identity })
      .whereIn(
        "i.id",
        knex
          .select("entityId")
          .from(projectIdentityEntities(knex, projectType, orgId).as("project_identities"))
          .where("kind", "i")
      )
      .groupBy("i.orgId", "i.projectId")
      .select({ orgId: "i.orgId", projectId: "i.projectId" })
      .count("i.id as count")) as { orgId: string; projectId: string | null; count: string | number }[];

    return rows.map((row) => ({ orgId: row.orgId, projectId: row.projectId, count: Number(row.count) }));
  }
}
