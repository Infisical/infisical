import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PkiAcmeAuth, "wildcard"))) {
    await knex.schema.alterTable(TableName.PkiAcmeAuth, (t) => {
      t.boolean("wildcard").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiAcmeAuth, "wildcard")) {
    await knex.schema.alterTable(TableName.PkiAcmeAuth, (t) => {
      t.dropColumn("wildcard");
    });
  }
}
