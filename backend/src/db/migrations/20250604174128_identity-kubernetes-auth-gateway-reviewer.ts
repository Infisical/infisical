import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTokenReviewModeColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "tokenReviewMode");

  if (!hasTokenReviewModeColumn) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.string("tokenReviewMode").notNullable().defaultTo("api");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTokenReviewModeColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "tokenReviewMode");

  if (hasTokenReviewModeColumn) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.dropColumn("tokenReviewMode");
    });
  }
}
