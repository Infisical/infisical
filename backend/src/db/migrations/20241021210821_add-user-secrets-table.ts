import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsUserSecret = await knex.schema.hasColumn(TableName.Secret, "isUserSecret");
  const hasIsUserSecretV2 = await knex.schema.hasColumn(TableName.SecretV2, "isUserSecret");

  if (!hasIsUserSecret) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      t.boolean("isUserSecret").defaultTo(false).notNullable();
    });
  }

  if (!hasIsUserSecretV2) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.boolean("isUserSecret").defaultTo(false).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIsUserSecret = await knex.schema.hasColumn(TableName.Secret, "isUserSecret");
  const hasIsUserSecretV2 = await knex.schema.hasColumn(TableName.SecretV2, "isUserSecret");

  if (hasIsUserSecret) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      t.dropColumn("isUserSecret");
    });
  }

  if (hasIsUserSecretV2) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.dropColumn("isUserSecret");
    });
  }
}
