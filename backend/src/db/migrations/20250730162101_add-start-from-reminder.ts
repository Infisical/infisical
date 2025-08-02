import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Reminder, "fromDate"))) {
    await knex.schema.alterTable(TableName.Reminder, (t) => {
      t.timestamp("fromDate", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Reminder, "fromDate")) {
    await knex.schema.alterTable(TableName.Reminder, (t) => {
      t.dropColumn("fromDate");
    });
  }
}
