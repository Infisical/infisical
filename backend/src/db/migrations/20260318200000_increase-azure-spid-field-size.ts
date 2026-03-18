import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityAzureAuth, "allowedServicePrincipalIds");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.IdentityAzureAuth, (t) => {
      t.string("allowedServicePrincipalIds", 2048).notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityAzureAuth, "allowedServicePrincipalIds");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.IdentityAzureAuth, (t) => {
      t.string("allowedServicePrincipalIds").notNullable().alter();
    });
  }
}
