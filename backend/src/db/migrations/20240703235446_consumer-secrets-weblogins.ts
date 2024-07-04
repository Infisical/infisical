import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.WebLogin))) {
    await knex.schema.createTable(TableName.WebLogin, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.timestamps(true, true);
      tb.uuid("orgId").notNullable().unique();
      tb.foreign("orgId").references("id").inTable(TableName.Organization);
      tb.uuid("userId").notNullable().unique();
      tb.foreign("userId").references("id").inTable(TableName.Users);
      tb.string("username").notNullable();
      tb.string("password").notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.WebLogin);
}
