import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

const INDEX_NAME = "idx_unique_secret_v2_key";

export async function up(knex: Knex): Promise<void> {
  const hasKeyCol = await knex.schema.hasColumn(TableName.SecretV2, "key");
  const hasFolderIdCol = await knex.schema.hasColumn(TableName.SecretV2, "folderId");
  const hasTypeCol = await knex.schema.hasColumn(TableName.SecretV2, "type");

  if (hasKeyCol && hasFolderIdCol && hasTypeCol) {
    await knex.raw(`
      CREATE UNIQUE INDEX ${INDEX_NAME} 
      ON ${TableName.SecretV2} ("key", "folderId") 
      WHERE type = 'shared'
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasKeyCol = await knex.schema.hasColumn(TableName.SecretV2, "key");
  const hasFolderIdCol = await knex.schema.hasColumn(TableName.SecretV2, "folderId");
  const hasTypeCol = await knex.schema.hasColumn(TableName.SecretV2, "type");

  if (hasKeyCol && hasFolderIdCol && hasTypeCol) {
    await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  }
}
