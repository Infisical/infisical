import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasExpiresAfterViewsColumn = await knex.schema.hasColumn(TableName.SecretSharing, "expiresAfterViews");
  const hasSecretNameColumn = await knex.schema.hasColumn(TableName.SecretSharing, "name");

  await knex.schema.alterTable(TableName.SecretSharing, (t) => {
    if (!hasExpiresAfterViewsColumn) {
      t.integer("expiresAfterViews").nullable();
      t.timestamp("expiresAt").nullable().alter();
    }

    if (hasSecretNameColumn) {
      t.dropColumn("name");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasExpiresAfterViewsColumn = await knex.schema.hasColumn(TableName.SecretSharing, "expiresAfterViews");
  const hasSecretNameColumn = await knex.schema.hasColumn(TableName.SecretSharing, "name");

  await knex.schema.alterTable(TableName.SecretSharing, (t) => {
    if (hasExpiresAfterViewsColumn) {
      t.dropColumn("expiresAfterViews");
      t.timestamp("expiresAt").notNullable().alter();
    }

    if (!hasSecretNameColumn) {
      t.string("name").notNullable();
    }
  });
}
