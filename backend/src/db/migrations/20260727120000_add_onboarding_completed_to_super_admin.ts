import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasOnboardingCompletedColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "onboardingCompleted");

  if (!hasOnboardingCompletedColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      table.boolean("onboardingCompleted").notNullable().defaultTo(false);
    });

    await knex(TableName.SuperAdmin).where({ initialized: true }).update({ onboardingCompleted: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOnboardingCompletedColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "onboardingCompleted");

  if (hasOnboardingCompletedColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      table.dropColumn("onboardingCompleted");
    });
  }
}
