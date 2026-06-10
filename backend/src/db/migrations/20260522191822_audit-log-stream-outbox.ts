import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AuditLogStreamOutbox))) {
    await knex.schema.createTable(TableName.AuditLogStreamOutbox, (t) => {
      t.bigIncrements("id").primary();
      t.uuid("streamId").notNullable();
      t.uuid("orgId").notNullable();
      t.uuid("auditLogId").notNullable();
      t.jsonb("payload").notNullable();
      t.string("status").notNullable().defaultTo("pending");
      t.check(`"status" IN ('pending', 'processing', 'retry', 'delivered')`);
      t.integer("attempts").notNullable().defaultTo(0);
      t.timestamp("nextRetryAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("lockedAt", { useTz: true });
      t.timestamps(true, true, true);

      t.unique(["streamId", "auditLogId"]);
    });

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.AuditLogStreamOutbox}_drain_idx"
      ON "${TableName.AuditLogStreamOutbox}" ("streamId", "nextRetryAt", "id")
      WHERE status IN ('pending', 'retry')
    `);

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.AuditLogStreamOutbox}_processing_idx"
      ON "${TableName.AuditLogStreamOutbox}" ("lockedAt")
      WHERE status = 'processing'
    `);

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.AuditLogStreamOutbox}_delivered_idx"
      ON "${TableName.AuditLogStreamOutbox}" ("updatedAt")
      WHERE status = 'delivered'
    `);
  }

  await createOnUpdateTrigger(knex, TableName.AuditLogStreamOutbox);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AuditLogStreamOutbox);
  await knex.schema.dropTableIfExists(TableName.AuditLogStreamOutbox);
}
