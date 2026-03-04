import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiSync)) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.string("name", 256).notNullable().alter();
    });
  }
}

export async function down(): Promise<void> {
  // No down migration or it will error
}
