import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIdentityIdColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "identityId");
  const hasAuthMethodColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "authMethod");

  await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
    if (hasIdentityIdColumn && hasAuthMethodColumn) {
      t.index(["authMethod", "identityId"]);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasIdentityIdColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "identityId");
  const hasAuthMethodColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "authMethod");

  await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
    if (hasIdentityIdColumn && hasAuthMethodColumn) {
      t.dropIndex(["authMethod", "identityId"]);
    }
  });
}
