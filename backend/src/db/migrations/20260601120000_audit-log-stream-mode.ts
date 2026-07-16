import { Knex } from "knex";

import { TableName } from "../schemas";

const STREAM_MODE_COLUMN = "streamMode";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AuditLogStream)) {
    const hasStreamMode = await knex.schema.hasColumn(TableName.AuditLogStream, STREAM_MODE_COLUMN);

    if (!hasStreamMode) {
      await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
        t.string(STREAM_MODE_COLUMN).notNullable().defaultTo("batch");
      });

      // Existing custom and cribl streams predate batched delivery and rely on one-event-per-request
      // POSTs (custom: a single JSON object; cribl: a single application/json body — not the NDJSON
      // batch shape). Keep them on "single" so we don't break their receivers; everything else
      // (other vendor providers + all new streams) stays on the "batch" default.
      // Raw update because the column was just added and isn't in the generated types yet.
      await knex(TableName.AuditLogStream)
        .whereIn("provider", ["custom", "cribl"])
        .update(STREAM_MODE_COLUMN, "single");
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AuditLogStream)) {
    const hasStreamMode = await knex.schema.hasColumn(TableName.AuditLogStream, STREAM_MODE_COLUMN);

    if (hasStreamMode) {
      await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
        t.dropColumn(STREAM_MODE_COLUMN);
      });
    }
  }
}
