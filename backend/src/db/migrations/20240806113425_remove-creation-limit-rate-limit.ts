import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCreationLimitCol = await knex.schema.hasColumn(TableName.DeprecatedRateLimit, "creationLimit");
  await knex.schema.alterTable(TableName.DeprecatedRateLimit, (t) => {
    if (hasCreationLimitCol) {
      t.dropColumn("creationLimit");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasCreationLimitCol = await knex.schema.hasColumn(TableName.DeprecatedRateLimit, "creationLimit");
  await knex.schema.alterTable(TableName.DeprecatedRateLimit, (t) => {
    if (!hasCreationLimitCol) {
      t.integer("creationLimit").defaultTo(30).notNullable();
    }
  });
}
