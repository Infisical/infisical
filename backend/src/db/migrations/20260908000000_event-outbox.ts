import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.EventOutbox))) {
    await knex.schema.createTable(TableName.EventOutbox, (t) => {
      // Ordering within a resource is read off this column, so it has to be monotonic.
      t.bigIncrements("id").primary();
      t.string("consumer").notNullable();
      t.string("eventType").notNullable();
      t.string("resourceType").notNullable();
      t.string("resourceId").notNullable();
      t.uuid("orgId").notNullable();
      t.string("projectId");
      // Opaque to the outbox: each consumer validates it against its own payloadSchema at emit.
      t.jsonb("payload").notNullable();
      t.string("idempotencyKey");
      t.timestamp("occurredAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.string("status").notNullable().defaultTo("pending");
      t.check(`"status" IN ('pending', 'processing', 'retry', 'delivered', 'failed')`);
      t.integer("attempts").notNullable().defaultTo(0);
      t.timestamp("nextRetryAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("lockedAt", { useTz: true });
      // Consumer-defined progress carried across attempts so a retry can skip what already landed.
      t.jsonb("progress");
      t.text("lastError");
      t.timestamps(true, true, true);
    });

    // Backs both the relay's discovery query and the per-resource claim. Leads with the flush key,
    // then `id` so the claim's ORDER BY is index-ordered with no sort, then `nextRetryAt` so
    // discovery's MIN() can be answered from the index rather than the heap.
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.EventOutbox}_drain_idx"
      ON "${TableName.EventOutbox}" ("consumer", "resourceType", "resourceId", "id", "nextRetryAt")
      WHERE status IN ('pending', 'retry')
    `);

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.EventOutbox}_processing_idx"
      ON "${TableName.EventOutbox}" ("lockedAt")
      WHERE status = 'processing'
    `);

    // Backs the oldest-pending health gauge, which runs on every relay tick forever. Without it that
    // query seq-scans the whole table to find a handful of undelivered rows, and the cost grows with
    // the delivered backlog rather than with the work outstanding.
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.EventOutbox}_undelivered_idx"
      ON "${TableName.EventOutbox}" ("consumer", "occurredAt")
      WHERE status IN ('pending', 'retry', 'processing')
    `);

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS "${TableName.EventOutbox}_terminal_idx"
      ON "${TableName.EventOutbox}" ("updatedAt")
      WHERE status IN ('delivered', 'failed')
    `);

    await knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "${TableName.EventOutbox}_idempotency_idx"
      ON "${TableName.EventOutbox}" ("consumer", "idempotencyKey")
      WHERE "idempotencyKey" IS NOT NULL
    `);
  }

  await createOnUpdateTrigger(knex, TableName.EventOutbox);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.EventOutbox);
  await knex.schema.dropTableIfExists(TableName.EventOutbox);
}
