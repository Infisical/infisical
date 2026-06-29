import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AuditReport))) {
    await knex.schema.createTable(TableName.AuditReport, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      // The requester is retained for history/audit; null it out (rather than cascade-delete the
      // report row) when the user is removed so the audit trail survives.
      t.uuid("requestedByUserId");
      t.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.string("status").notNullable().defaultTo("pending");
      // [{ type, inputs }, ...] — the report types requested in this batch.
      t.jsonb("reportConfigs").notNullable();
      t.specificType("emailRecipients", "text[]").notNullable();
      // [{ type, rowCount, truncated }, ...] — populated by the generation worker on success.
      t.jsonb("resultSummary");
      t.text("errorMessage");
      t.timestamps(true, true, true);
      // FK indexes — Postgres does not auto-index FK columns.
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
