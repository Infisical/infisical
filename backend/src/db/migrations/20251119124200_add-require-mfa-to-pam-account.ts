import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "requireMfa"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.boolean("requireMfa").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamAccount, "requireMfa")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("requireMfa");
    });
  }
}
