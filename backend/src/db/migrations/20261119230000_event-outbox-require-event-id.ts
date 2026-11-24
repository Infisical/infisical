import { Knex } from "knex";

import { TableName } from "../schemas";

const IDEMPOTENCY_INDEX = `${TableName.EventOutbox}_idempotency_idx`;

// Every release since `eventId` was added writes it and none reads `idempotencyKey`. The default covers a pod
// from before that release still inserting during a rolling deploy.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.EventOutbox, "eventId")) {
    await knex(TableName.EventOutbox)
      .whereNull("eventId")
      .update({ eventId: knex.raw("gen_random_uuid()") });
    await knex.schema.alterTable(TableName.EventOutbox, (t) => {
      t.uuid("eventId").notNullable().defaultTo(knex.raw("gen_random_uuid()")).alter();
    });
  }

  await knex.schema.raw(`DROP INDEX IF EXISTS "${IDEMPOTENCY_INDEX}"`);
  if (await knex.schema.hasColumn(TableName.EventOutbox, "idempotencyKey")) {
    await knex.schema.alterTable(TableName.EventOutbox, (t) => {
      t.dropColumn("idempotencyKey");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.EventOutbox, "idempotencyKey"))) {
    await knex.schema.alterTable(TableName.EventOutbox, (t) => {
      t.string("idempotencyKey");
    });
  }
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS "${IDEMPOTENCY_INDEX}"
    ON "${TableName.EventOutbox}" ("consumer", "idempotencyKey")
    WHERE "idempotencyKey" IS NOT NULL
  `);

  if (await knex.schema.hasColumn(TableName.EventOutbox, "eventId")) {
    await knex.schema.alterTable(TableName.EventOutbox, (t) => {
      t.uuid("eventId").nullable().defaultTo(null).alter();
    });
  }
}
