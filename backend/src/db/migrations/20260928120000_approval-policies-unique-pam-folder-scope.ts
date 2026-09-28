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

  const survivorByScope = new Map<string, string>();
  const stale: { id: string; survivorId: string }[] = [];
  for (const policy of duplicates) {
    const key = `${policy.scopeType as string}:${policy.scopeId as string}`;
    const survivorId = survivorByScope.get(key);
    if (survivorId) stale.push({ id: policy.id, survivorId });
    else survivorByScope.set(key, policy.id);
  }

  for (const { id, survivorId } of stale) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.ApprovalRequests).where("policyId", id).update({ policyId: survivorId });
  }

  if (stale.length > 0) {
    await knex(TableName.ApprovalPolicies)
      .whereIn(
        "id",
        stale.map((s) => s.id)
      )
      .delete();
  }

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ?? ("scopeType", "scopeId") WHERE type = '${PAM_ACCESS}' AND "scopeId" IS NOT NULL`,
    [INDEX_NAME, TableName.ApprovalPolicies]
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ??`, [INDEX_NAME]);
}
