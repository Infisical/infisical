import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// Audit reports gain an org scope: a report row is either project-scoped (projectId set) or
// org-scoped (orgId set), never both. Raw SQL is used for the NOT NULL toggle so the existing
// projectId FK and index are left untouched.
export async function up(knex: Knex): Promise<void> {
  const hasOrgId = await knex.schema.hasColumn(TableName.AuditReport, "orgId");
  if (!hasOrgId) {
    await knex.raw(`ALTER TABLE "${TableName.AuditReport}" ALTER COLUMN "projectId" DROP NOT NULL`);

    await knex.schema.alterTable(TableName.AuditReport, (t) => {
      t.uuid("orgId").nullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.index(["orgId"]);
    });

    await knex.raw(
      `ALTER TABLE "${TableName.AuditReport}" ADD CONSTRAINT "audit_reports_one_scope_check"
       CHECK ((("projectId" IS NOT NULL)::int + ("orgId" IS NOT NULL)::int) = 1)`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOrgId = await knex.schema.hasColumn(TableName.AuditReport, "orgId");
  if (hasOrgId) {
    await knex.raw(`ALTER TABLE "${TableName.AuditReport}" DROP CONSTRAINT IF EXISTS "audit_reports_one_scope_check"`);

    // Org-scoped rows cannot survive the NOT NULL restore on projectId.
    await knex(TableName.AuditReport).whereNull("projectId").delete();

    await knex.schema.alterTable(TableName.AuditReport, (t) => {
      t.dropColumn("orgId");
    });

    await knex.raw(`ALTER TABLE "${TableName.AuditReport}" ALTER COLUMN "projectId" SET NOT NULL`);
  }
}
