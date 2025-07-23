import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityAwsAuth, "allowedPrincipalArns");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.IdentityAwsAuth, (t) => {
      t.string("allowedPrincipalArns", 4096).notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityAwsAuth, "allowedPrincipalArns");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.IdentityAwsAuth, (t) => {
      t.string("allowedPrincipalArns", 2048).notNullable().alter();
    });
  }
}
