import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIdentityCreationLimitCol = await knex.schema.hasColumn(TableName.DeprecatedRateLimit, "identityCreationLimit");
  const hasProjectCreationLimitCol = await knex.schema.hasColumn(TableName.DeprecatedRateLimit, "projectCreationLimit");

  await knex.schema.alterTable(TableName.DeprecatedRateLimit, (t) => {
    if (!hasIdentityCreationLimitCol) {
      t.integer("identityCreationLimit").defaultTo(30).notNullable();
    }
    if (!hasProjectCreationLimitCol) {
      t.integer("projectCreationLimit").defaultTo(30).notNullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasIdentityCreationLimitCol = await knex.schema.hasColumn(TableName.DeprecatedRateLimit, "identityCreationLimit");
  const hasProjectCreationLimitCol = await knex.schema.hasColumn(TableName.DeprecatedRateLimit, "projectCreationLimit");

  await knex.schema.alterTable(TableName.DeprecatedRateLimit, (t) => {
    if (hasIdentityCreationLimitCol) {
      t.dropColumn("identityCreationLimit");
    }
    if (hasProjectCreationLimitCol) {
      t.dropColumn("projectCreationLimit");
    }
  });
}
