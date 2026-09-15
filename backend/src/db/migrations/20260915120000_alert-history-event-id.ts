import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AlertHistory, "eventId"))) {
    await knex.schema.alterTable(TableName.AlertHistory, (t) => {
      // Set on runs the event outbox triggered. A retry of the same event reads the successful
      // deliveries recorded under it and skips those channels, so a channel that already notified is
      // never notified twice. Null on scheduled runs, which dedupe by time window instead.
      t.string("eventId").nullable();
      t.index(["alertId", "eventId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AlertHistory, "eventId")) {
    await knex.schema.alterTable(TableName.AlertHistory, (t) => {
      t.dropIndex(["alertId", "eventId"]);
      t.dropColumn("eventId");
    });
  }
}
