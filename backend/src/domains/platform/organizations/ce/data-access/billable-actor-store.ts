import { Knex } from "knex";

import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { toCount, TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { TBillableActorStore, TIdentityOwnership } from "../services/dependencies";

// Billable = org member in a Secret Manager/KMS project or in no project at all (direct or via a group).
// Actors only in PAM, PKI etc. don't count.
const COUNTED_PROJECT_TYPES = [ProjectType.SecretManager, ProjectType.KMS];

// Reads tables a future domain will own; see ../../AGENTS.md.
export class BillableActorStore implements TBillableActorStore {
  constructor(private readonly connection: TStoreConnection) {}

  async countBillableOrgActors(
    orgId: string | null,
    options?: TReadOptions
  ): Promise<{ users: number; identities: number }> {
    try {
      const knex = this.connection.reader(options);

      const row = (await BillableActorStore.withBillableScopes(knex, orgId)
        .with("counted_members", BillableActorStore.countedMembersCte(knex))
        .with("projectless_users", BillableActorStore.projectlessUsersCte(knex))
        .with("projectless_identities", BillableActorStore.projectlessIdentitiesCte(knex))
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
  async getBillableIdentityOwnershipBreakdown(
    orgId: string | null,
    options?: TReadOptions
  ): Promise<TIdentityOwnership[]> {
    try {
      const knex = this.connection.reader(options);

      const rows = (await BillableActorStore.withBillableScopes(knex, orgId)
        .with("counted_members", BillableActorStore.countedMembersCte(knex))
        .with("projectless_identities", BillableActorStore.projectlessIdentitiesCte(knex))
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

  private static withBillableScopes(knex: Knex, orgId: string | null) {
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
  private static countedMembersCte(knex: Knex) {
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
  private static projectlessUsersCte(knex: Knex) {
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

  private static projectlessIdentitiesCte(knex: Knex) {
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
}
