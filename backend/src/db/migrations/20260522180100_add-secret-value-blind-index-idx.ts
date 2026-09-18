import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretV2)) {
    // Partial index: only index rows where secretValueBlindIndex is not null
    // This saves space for secrets without a blind index (e.g., empty values)
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_secrets_v2_secret_value_blind_index
      ON ${TableName.SecretV2} ("secretValueBlindIndex")
      WHERE "secretValueBlindIndex" IS NOT NULL
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_secrets_v2_secret_value_blind_index`);
}

// CONCURRENTLY requires running outside a transaction
const config = { transaction: false };
export { config };
