import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "approval_policies_pam_access_scope_unique";
const PAM_ACCESS = "pam-access";

export async function up(knex: Knex): Promise<void> {
  const duplicates = await knex(TableName.ApprovalPolicies)
    .where("type", PAM_ACCESS)
    .whereNotNull("scopeId")
    .select("id", "scopeType", "scopeId", "createdAt")
    .orderBy([{ column: "scopeId" }, { column: "createdAt" }]);

  const seen = new Set<string>();
  const staleIds: string[] = [];
  for (const policy of duplicates) {
    const key = `${policy.scopeType as string}:${policy.scopeId as string}`;
    if (seen.has(key)) staleIds.push(policy.id);
    else seen.add(key);
  }

  if (staleIds.length > 0) {
    await knex(TableName.ApprovalRequests)
      .whereIn("policyId", staleIds)
      .where("status", "pending")
      .update({ status: "cancelled" });
    await knex(TableName.ApprovalPolicies).whereIn("id", staleIds).delete();
  }

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ?? ("scopeType", "scopeId") WHERE type = ? AND "scopeId" IS NOT NULL`,
    [INDEX_NAME, TableName.ApprovalPolicies, PAM_ACCESS]
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ??`, [INDEX_NAME]);
}
