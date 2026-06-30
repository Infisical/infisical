import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";
import { AuditReportStatus } from "@app/ee/services/audit-report/audit-report-types";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AuditReport))) {
    await knex.schema.createTable(TableName.AuditReport, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.uuid("requestedByUserId");
      t.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");

      t.string("status").notNullable().defaultTo(AuditReportStatus.Pending);
      t.jsonb("reportConfigs").notNullable();
      t.specificType("emailRecipients", "text[]").notNullable();
      t.jsonb("resultSummary");
      t.text("errorMessage");
      t.timestamps(true, true, true);

      t.index(["projectId"]);
      t.index(["requestedByUserId"]);
    });

    await createOnUpdateTrigger(knex, TableName.AuditReport);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AuditReport);
  await knex.schema.dropTableIfExists(TableName.AuditReport);
}
