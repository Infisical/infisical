import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCreationLimitCol = await knex.schema.hasColumn(TableName.RateLimit, "creationLimit");
  await knex.schema.alterTable(TableName.RateLimit, (t) => {
    if (hasCreationLimitCol) {
      t.dropColumn("creationLimit");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasCreationLimitCol = await knex.schema.hasColumn(TableName.RateLimit, "creationLimit");
  await knex.schema.alterTable(TableName.RateLimit, (t) => {
    if (!hasCreationLimitCol) {
      t.integer("creationLimit").defaultTo(30).notNullable();
    }
  });
}
