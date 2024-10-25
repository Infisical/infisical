import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// add indexes to improve dashboard search performance

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretV2, "key"))
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.index("key");
    });

  if (await knex.schema.hasColumn(TableName.SecretFolder, "name"))
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.index("name");
    });

  if (await knex.schema.hasColumn(TableName.SecretTag, "slug"))
    await knex.schema.alterTable(TableName.SecretTag, (t) => {
      t.index("slug");
    });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretV2, "key"))
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.dropIndex("key");
    });

  if (await knex.schema.hasColumn(TableName.SecretFolder, "name"))
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.dropIndex("name");
    });

  if (await knex.schema.hasColumn(TableName.SecretTag, "slug"))
    await knex.schema.alterTable(TableName.SecretTag, (t) => {
      t.dropIndex("slug");
    });
}
