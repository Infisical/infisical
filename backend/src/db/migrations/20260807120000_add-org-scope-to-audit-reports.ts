import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  const hasOrgId = await knex.schema.hasColumn(TableName.AuditReport, "orgId");
  const hasTable = await knex.schema.hasTable(TableName.AuditReport);
  if (hasTable && !hasOrgId) {
    await knex.raw(`ALTER TABLE "${TableName.AuditReport}" ALTER COLUMN "projectId" DROP NOT NULL`);

    await knex.schema.alterTable(TableName.AuditReport, (t) => {
      t.uuid("orgId").nullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.index(["orgId"]);

      t.check(
        '("projectId" IS NOT NULL AND "orgId" IS NULL) OR ("projectId" IS NULL AND "orgId" IS NOT NULL)',
        [],
        "audit_reports_one_scope_check"
      );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOrgId = await knex.schema.hasColumn(TableName.AuditReport, "orgId");
  const hasTable = await knex.schema.hasTable(TableName.AuditReport);
  if (hasTable && hasOrgId) {
    // Org-scoped rows cannot survive the NOT NULL restore on projectId.
    await knex(TableName.AuditReport).whereNull("projectId").delete();

    await knex.schema.alterTable(TableName.AuditReport, (t) => {
      t.dropChecks("audit_reports_one_scope_check");
      t.dropColumn("orgId");
    });

    await knex.raw(`ALTER TABLE "${TableName.AuditReport}" ALTER COLUMN "projectId" SET NOT NULL`);
  }
}
