import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AuditLogStreamOutbox))) {
    await knex.schema.createTable(TableName.AuditLogStreamOutbox, (t) => {
      t.bigIncrements("id").primary();
      t.uuid("streamId").notNullable();
      t.uuid("orgId").notNullable();
      t.jsonb("payload").notNullable();
      t.string("status").notNullable().defaultTo("pending");
      t.check(`"status" IN ('pending', 'processing', 'retry')`);
      t.integer("attempts").notNullable().defaultTo(0);
      t.timestamp("nextRetryAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("lockedAt", { useTz: true });
      t.string("workerId");
      t.text("lastError");
      t.timestamps(true, true, true);

      t.foreign("streamId").references("id").inTable(TableName.AuditLogStream).onDelete("CASCADE");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });

    // Worker drain query: WHERE streamId = ? AND status IN ('pending','retry') AND nextRetryAt <= NOW() ORDER BY id LIMIT N FOR UPDATE SKIP LOCKED
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.AuditLogStreamOutbox}_drain_idx"
      ON "${TableName.AuditLogStreamOutbox}" ("streamId", "nextRetryAt", "id")
      WHERE status IN ('pending', 'retry')
    `);

    // Stale lock recovery: surface rows stuck in 'processing' (worker crashed mid-batch).
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.AuditLogStreamOutbox}_processing_idx"
      ON "${TableName.AuditLogStreamOutbox}" ("lockedAt")
      WHERE status = 'processing'
    `);
  }

  await createOnUpdateTrigger(knex, TableName.AuditLogStreamOutbox);

  if (!(await knex.schema.hasTable(TableName.AuditLogStreamOutboxDlq))) {
    await knex.schema.createTable(TableName.AuditLogStreamOutboxDlq, (t) => {
      t.bigIncrements("id").primary();
      t.bigInteger("originalAuditLogStreamOutboxId").notNullable();
      t.uuid("streamId").notNullable();
      t.uuid("orgId").notNullable();
      t.jsonb("payload").notNullable();
      t.integer("attempts").notNullable();
      t.text("lastError");
      t.timestamp("originalCreatedAt", { useTz: true }).notNullable();
      t.timestamp("failedAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.foreign("streamId").references("id").inTable(TableName.AuditLogStream).onDelete("CASCADE");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.index(["streamId", "failedAt"]);
      t.index(["orgId", "failedAt"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AuditLogStreamOutbox);
  await knex.schema.dropTableIfExists(TableName.AuditLogStreamOutboxDlq);
  await knex.schema.dropTableIfExists(TableName.AuditLogStreamOutbox);
}
