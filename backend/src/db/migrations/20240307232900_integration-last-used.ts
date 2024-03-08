import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Integration, (t) => {
    t.datetime("lastUsed");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Integration, (t) => {
    t.dropColumn("lastUsed");
  });
}
