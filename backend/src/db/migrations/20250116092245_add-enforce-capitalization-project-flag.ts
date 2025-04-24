import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEnforceCapitalizationCol = await knex.schema.hasColumn(TableName.Project, "enforceCapitalization");
  const hasAutoCapitalizationCol = await knex.schema.hasColumn(TableName.Project, "autoCapitalization");

  await knex.schema.alterTable(TableName.Project, (t) => {
    if (!hasEnforceCapitalizationCol) {
      t.boolean("enforceCapitalization").defaultTo(false).notNullable();
    }

    if (hasAutoCapitalizationCol) {
      t.boolean("autoCapitalization").defaultTo(false).alter();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasEnforceCapitalizationCol = await knex.schema.hasColumn(TableName.Project, "enforceCapitalization");
  const hasAutoCapitalizationCol = await knex.schema.hasColumn(TableName.Project, "autoCapitalization");

  await knex.schema.alterTable(TableName.Project, (t) => {
    if (hasEnforceCapitalizationCol) {
      t.dropColumn("enforceCapitalization");
    }

    if (hasAutoCapitalizationCol) {
      t.boolean("autoCapitalization").defaultTo(true).alter();
    }
  });
}
