import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Relay, "heartbeat"))) {
    await knex.schema.alterTable(TableName.Relay, (t) => {
      t.datetime("heartbeat");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Relay, "heartbeat")) {
    await knex.schema.alterTable(TableName.Relay, (t) => {
      t.dropColumn("heartbeat");
    });
  }
}
