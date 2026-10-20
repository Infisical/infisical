import { Knex } from "knex";

import { TableName } from "../schemas";

// One id per event, shared by every consumer's row, so the same occurrence can be recognised across
// consumers and handed out as the CloudEvents `id`. The row `id` is per consumer and can't serve.
// Nullable with no default: a pod still running the previous release inserts without it during a rolling
// deploy, and NOT NULL would fail that insert along with the write it belongs to. Those rows are pruned
// within a day.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.EventOutbox, "eventId")) return;

  await knex.schema.alterTable(TableName.EventOutbox, (t) => {
    t.uuid("eventId");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.EventOutbox, "eventId"))) return;

  await knex.schema.alterTable(TableName.EventOutbox, (t) => {
    t.dropColumn("eventId");
  });
}
