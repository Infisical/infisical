import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AlertHistory, "eventId"))) {
    await knex.schema.alterTable(TableName.AlertHistory, (t) => {
      // Set on event-triggered runs so a retry can skip channels that already delivered. Null on
      // scheduled runs, which dedupe by time window instead.
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
