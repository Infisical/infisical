import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "secret_versions_v2_secretid_version_index";
const MIGRATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    await knex.raw(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}" ON "${TableName.SecretVersionV2}" ("secretId", "version")`
    );
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
