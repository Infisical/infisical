import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    const hasAltNamesColumn = await knex.schema.hasColumn(TableName.Certificate, "altNames");
    if (!hasAltNamesColumn) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.string("altNames").defaultTo("");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    if (await knex.schema.hasColumn(TableName.Certificate, "altNames")) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.dropColumn("altNames");
      });
    }
  }
}
