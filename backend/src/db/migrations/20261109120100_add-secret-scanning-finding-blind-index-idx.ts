import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

const INDEX_NAME = "idx_secret_scanning_findings_secret_finding_blind_index";
const COLUMN = "secretFindingBlindIndex";

export async function up(knex: Knex): Promise<void> {
  if (
    !(await knex.schema.hasTable(TableName.SecretScanningFinding)) ||
    !(await knex.schema.hasColumn(TableName.SecretScanningFinding, COLUMN))
  )
    return;

  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      INDEX_NAME,
      `ON "${TableName.SecretScanningFinding}" ("${COLUMN}") WHERE "${COLUMN}" IS NOT NULL`
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
  });
}

const config = { transaction: false };
export { config };
