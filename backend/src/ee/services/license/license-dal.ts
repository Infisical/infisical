import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TLicenseDALFactory = ReturnType<typeof licenseDALFactory>;

// A user/identity occupies a billable seat only when it is (a) an org member, and (b) either a member
// of a Secret-Management-flavoured project (Secret Manager or KMS) or not a member of any project at
// all. Actors that only live in other project types (PAM, PKI, ...) do not count. Membership can be
// direct or inherited through a group.
const COUNTED_PROJECT_TYPES = [ProjectType.SecretManager, ProjectType.KMS];

// One machine identity's billable seat, resolved to where the identity was created: the project that
// owns it, or the org itself when it is org-owned (identities.projectId is null).
export type TBillableIdentityOwnershipRow = { orgId: string; projectId: string | null; count: number };

// The scope CTEs every billable-actor query starts from. Extracted so the seat counter and the usage
// breakdown resolve "which actors are in scope" from one definition — a breakdown that disagreed with
// the meter would show the customer a total that isn't the one they are billed on.
// Attaches: orgs, counted_projects, all_projects, org_users, org_identities.
const $withBillableScopes = (knex: Knex, orgId: string | null) => {
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
      // Projects whose members count toward a seat (Secret Manager + KMS), excluding soft-deleted ones.
      .with("counted_projects", (qb) => {
        void qb
          .from(TableName.Project)
          .whereNull("deleteAfter")
          .whereIn("type", COUNTED_PROJECT_TYPES)
          .whereIn("orgId", knex.select("id").from("orgs"))
          .select("id");
      })
      // Every live project in scope, used to decide whether an actor is projectless.
      .with("all_projects", (qb) => {
        void qb
          .from(TableName.Project)
          .whereNull("deleteAfter")
          .whereIn("orgId", knex.select("id").from("orgs"))
          .select("id");
      })
      // Real (accepted, non-ghost) org-member users in scope, deduped across orgs.
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
const $countedMembersCte = (knex: Knex) => (qb: Knex.QueryBuilder) => {
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

// Org users with no project membership at all (direct or via a group) count as present in the org.
const $projectlessUsersCte = (knex: Knex) => (qb: Knex.QueryBuilder) => {
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

const $projectlessIdentitiesCte = (knex: Knex) => (qb: Knex.QueryBuilder) => {
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

export const licenseDALFactory = (db: TDbClient) => {
  const countBillableOrgActors = async (
    orgId: string | null,
    tx?: Knex
  ): Promise<{ users: number; identities: number }> => {
    try {
      const knex = tx || db.replicaNode();

      const row = (await $withBillableScopes(knex, orgId)
        .with("counted_members", $countedMembersCte(knex))
        .with("projectless_users", $projectlessUsersCte(knex))
        .with("projectless_identities", $projectlessIdentitiesCte(knex))
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
  };

  // The same seats countBillableOrgActors bills for, attributed to where each machine identity was
  // created. Seats are held by membership (an identity can sit in many projects), so grouping on
  // membership would count one identity several times; identities.projectId is a single column, so
  // grouping on ownership partitions the billed total exactly once across the tree.
  const getBillableIdentityOwnershipBreakdown = async (
    orgId: string,
    tx?: Knex
  ): Promise<TBillableIdentityOwnershipRow[]> => {
    try {
      const knex = tx || db.replicaNode();

      const rows = (await $withBillableScopes(knex, orgId)
        .with("counted_members", $countedMembersCte(knex))
        .with("projectless_identities", $projectlessIdentitiesCte(knex))
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
  };

  const countOfOrgMembers = async (orgId: string | null, tx?: Knex) => {
    const { users } = await countBillableOrgActors(orgId, tx);
    return users;
  };

  const countOrgUsersAndIdentities = async (orgId: string | null, tx?: Knex) => {
    const { users, identities } = await countBillableOrgActors(orgId, tx);
    return users + identities;
  };

  return {
    countBillableOrgActors,
    getBillableIdentityOwnershipBreakdown,
    countOfOrgMembers,
    countOrgUsersAndIdentities
  };
};
