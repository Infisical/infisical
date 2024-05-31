import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasExpiresAfterViewsColumn = await knex.schema.hasColumn(TableName.SecretSharing, "expiresAfterViews");
  const hasSecretNameColumn = await knex.schema.hasColumn(TableName.SecretSharing, "name");

  await knex.schema.alterTable(TableName.SecretSharing, (t) => {
    if (!hasExpiresAfterViewsColumn) {
      t.integer("expiresAfterViews");
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
    }

    if (!hasSecretNameColumn) {
      t.string("name").notNullable();
    }
  });
}
