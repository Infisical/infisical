import { Knex } from "knex";

import { TableName } from "../schemas";

const EVENT_ID_INDEX = `${TableName.EventOutbox}_event_id_idx`;

// The CloudEvents id, shared by every consumer's row for one event. It replaces `idempotencyKey`, but both
// stay for one release: during a rolling deploy old pods still insert into `idempotencyKey` and name its
// index in ON CONFLICT, so dropping either would fail those inserts along with the writes they belong to.
// Same reason `eventId` is nullable with no default; `claimBatch` fills it in.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.EventOutbox, "eventId"))) {
    await knex.schema.alterTable(TableName.EventOutbox, (t) => {
      t.uuid("eventId");
    });
  }

  // Not partial, so ON CONFLICT can name the columns. NULLs never conflict, so rows without an id
  // still insert.
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS "${EVENT_ID_INDEX}"
    ON "${TableName.EventOutbox}" ("consumer", "eventId")
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS "${EVENT_ID_INDEX}"`);

  if (await knex.schema.hasColumn(TableName.EventOutbox, "eventId")) {
    await knex.schema.alterTable(TableName.EventOutbox, (t) => {
      t.dropColumn("eventId");
    });
  }
}
