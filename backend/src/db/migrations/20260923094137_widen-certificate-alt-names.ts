import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Certificate, "altNames");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Certificate, (table) => {
      table.text("altNames").nullable().alter();
    });
  }
}

export async function down(): Promise<void> {}
