import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.SuperAdmin);
  if (isTablePresent) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.boolean("inviteOnlySignUp").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SuperAdmin, "inviteOnlySignUp")) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("inviteOnlySignUp");
    });
  }
}
