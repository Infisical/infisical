import { Knex } from "knex";

import { TableName } from "../schemas";

// One id per event, shared by every consumer's row, so the same occurrence can be recognised across
// consumers and handed out as the CloudEvents `id`. The row `id` is per consumer and can't serve.
// The default only fills rows written before this column existed and rows from a pod that doesn't set
// it yet; the outbox is pruned within a day, so the rewrite the volatile default causes is small.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.EventOutbox, "eventId")) return;

  await knex.schema.alterTable(TableName.EventOutbox, (t) => {
    t.uuid("eventId").notNullable().defaultTo(knex.fn.uuid());
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.EventOutbox, "eventId"))) return;

  await knex.schema.alterTable(TableName.EventOutbox, (t) => {
    t.dropColumn("eventId");
  });
}
