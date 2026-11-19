// This shouldn't have any effect since making duplicate policies for PAM is logically impossible
// unless you hit a tiny window. This is just reinforcement code

import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "approval_policies_pam_access_scope_unique";
const PAM_ACCESS = "pam-access";

export async function up(knex: Knex): Promise<void> {
  const stale = await knex(TableName.ApprovalPolicies)
    .where("type", PAM_ACCESS)
    .whereNotNull("scopeId")
    .whereNotIn(
      "id",
      knex.select("id").from(
        knex(TableName.ApprovalPolicies)
          .where("type", PAM_ACCESS)
          .whereNotNull("scopeId")
          .distinctOn("scopeId")
          .orderBy([{ column: "scopeId" }, { column: "createdAt" }])
          .select("id")
          .as("survivors")
      )
    )
    .pluck("id");

  if (stale.length > 0) {
    await knex(TableName.ApprovalRequests)
      .whereIn("policyId", stale)
      .where("status", "pending")
      .update({ status: "cancelled" });

    await knex(TableName.ApprovalPolicies).whereIn("id", stale).delete();
  }

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ?? ("scopeType", "scopeId") WHERE type = '${PAM_ACCESS}' AND "scopeId" IS NOT NULL`,
    [INDEX_NAME, TableName.ApprovalPolicies]
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ??`, [INDEX_NAME]);
}
