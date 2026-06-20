import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "credentialConfigured"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.boolean("credentialConfigured").notNullable().defaultTo(false);
    });

    await knex(TableName.PamAccount).update({ credentialConfigured: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamAccount, "credentialConfigured")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("credentialConfigured");
    });
  }
}
