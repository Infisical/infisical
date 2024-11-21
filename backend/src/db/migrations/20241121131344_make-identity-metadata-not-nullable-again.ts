import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.IdentityMetadata, "value")) {
    await knex(TableName.IdentityMetadata).whereNull("value").delete();
    await knex.schema.alterTable(TableName.IdentityMetadata, (t) => {
      t.string("value", 1020).notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.IdentityMetadata, "value")) {
    await knex.schema.alterTable(TableName.IdentityMetadata, (t) => {
      t.string("value", 1020).alter();
    });
  }
}
