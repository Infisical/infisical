import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.KeyValueStore))) {
    await knex.schema.createTable(TableName.KeyValueStore, (t) => {
      t.text("key").primary();
      t.bigint("integerValue");
      t.datetime("expiresAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.KeyValueStore);
}
