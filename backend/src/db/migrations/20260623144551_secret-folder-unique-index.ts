import { Knex } from "knex";

import { TableName } from "../schemas";

const MIGRATION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const DROP_TIMEOUT = 60 * 3000; // 3 minute

const INDEX_NAME = "uq_secrets_v2_key_folder_id_shared";

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    if (
      (await knex.schema.hasTable(TableName.SecretV2)) &&
      (await knex.schema.hasColumn(TableName.SecretV2, "folderId")) &&
      (await knex.schema.hasColumn(TableName.SecretV2, "key")) &&
      (await knex.schema.hasColumn(TableName.SecretV2, "type"))
    ) {
      await knex.raw(`
          CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME}
          ON ${TableName.SecretV2} ("key", "folderId")
          WHERE "type" = 'shared'
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${DROP_TIMEOUT}`);
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${INDEX_NAME}`);
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

const config = { transaction: false };
export { config };
