import { Knex } from "knex";

import { TableName } from "../schemas";

const COLUMN_NAME = "agentVaultSessionId";
const FOREIGN_KEY_NAME = "resource_metadata_agentvaultsessionid_foreign";
const INDEX_NAME = "resource_metadata_agent_vault_session_id_idx";

const MIGRATION_TIMEOUT = 60 * 60 * 1000;
const MIGRATION_LOCK_TIMEOUT = 30 * 1000;

// resource_metadata is large, so the foreign key is added NOT VALID and validated separately (which takes no lock
// that blocks writes) and the index is built concurrently. Each step checks first, so a rerun after a partial failure
// picks up where it stopped.
export async function up(knex: Knex): Promise<void> {
  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
  const lockResult = await knex.raw("SHOW lock_timeout");
  const originalLockTimeout = lockResult.rows[0].lock_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
    await knex.raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

    if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, COLUMN_NAME))) {
      await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
        tb.uuid(COLUMN_NAME);
      });
    }

    const existingForeignKey = await knex.raw(
      `SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass`,
      [FOREIGN_KEY_NAME, TableName.ResourceMetadata]
    );
    if (!existingForeignKey.rows.length) {
      await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (id) ON DELETE CASCADE NOT VALID`,
        [TableName.ResourceMetadata, FOREIGN_KEY_NAME, COLUMN_NAME, TableName.AgentVaultSession]
      );
    }

    await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [TableName.ResourceMetadata, FOREIGN_KEY_NAME]);

    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (??) WHERE ?? IS NOT NULL`, [
      INDEX_NAME,
      TableName.ResourceMetadata,
      COLUMN_NAME,
      COLUMN_NAME
    ]);
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [INDEX_NAME]);
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [TableName.ResourceMetadata, FOREIGN_KEY_NAME]);
  if (await knex.schema.hasColumn(TableName.ResourceMetadata, COLUMN_NAME)) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.dropColumn(COLUMN_NAME);
    });
  }
}

const config = { transaction: false };
export { config };
