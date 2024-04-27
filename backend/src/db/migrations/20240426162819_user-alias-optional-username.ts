import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.UserAliases, (t) => {
    t.string("username").nullable().alter();
  });
}

export async function down(): Promise<void> {}
