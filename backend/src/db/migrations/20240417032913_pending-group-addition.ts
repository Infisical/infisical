import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.UserGroupMembership, (t) => {
    t.boolean("isPending").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.UserGroupMembership, (t) => {
    t.dropColumn("isPending");
  });
}
