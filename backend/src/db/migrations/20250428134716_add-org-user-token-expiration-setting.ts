import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Organization, "userTokenExpiration"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.string("userTokenExpiration").defaultTo("30d").notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Organization, "userTokenExpiration")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("userTokenExpiration");
    });
  }
}
