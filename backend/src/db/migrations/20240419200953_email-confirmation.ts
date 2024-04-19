import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Users, (t) => {
    t.boolean("isEmailVerified");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Users, (t) => {
    t.dropColumn("isEmailVerified");
  });
}
