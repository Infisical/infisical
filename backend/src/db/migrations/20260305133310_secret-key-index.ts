import { Knex } from "knex";

import { TableName } from "../schemas";

const MIGRATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    if (
      (await knex.schema.hasTable(TableName.SecretV2)) &&
      (await knex.schema.hasColumn(TableName.SecretV2, "folderId")) &&
      (await knex.schema.hasColumn(TableName.SecretV2, "key"))
    ) {
      await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_secrets_v2_folder_id_key
          ON ${TableName.SecretV2} ("folderId", "key")
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
      DROP INDEX IF EXISTS idx_secrets_v2_folder_id_key
    `);
}

const config = { transaction: false };
export { config };
