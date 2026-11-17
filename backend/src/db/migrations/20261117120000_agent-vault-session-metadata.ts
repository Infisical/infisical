import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

const COLUMN_NAME = "agentVaultSessionId";
const FOREIGN_KEY_NAME = "resource_metadata_agentvaultsessionid_foreign";
const INDEX_NAME = "resource_metadata_agent_vault_session_id_idx";

// resource_metadata is large, so the foreign key is added NOT VALID and validated separately (which takes no lock
// that blocks writes) and the index is built concurrently. Each step checks first, so a rerun after a partial failure
// picks up where it stopped.
export async function up(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    await raw(`ALTER TABLE "${TableName.ResourceMetadata}" ADD COLUMN IF NOT EXISTS "${COLUMN_NAME}" uuid`);

    const existingForeignKey = await raw(
      `SELECT 1 FROM pg_constraint WHERE conname = '${FOREIGN_KEY_NAME}' AND conrelid = '"${TableName.ResourceMetadata}"'::regclass`
    );
    if (!existingForeignKey.rows.length) {
      await raw(
        `ALTER TABLE "${TableName.ResourceMetadata}" ADD CONSTRAINT "${FOREIGN_KEY_NAME}" FOREIGN KEY ("${COLUMN_NAME}") REFERENCES "${TableName.AgentVaultSession}" (id) ON DELETE CASCADE NOT VALID`
      );
    }

    await raw(`ALTER TABLE "${TableName.ResourceMetadata}" VALIDATE CONSTRAINT "${FOREIGN_KEY_NAME}"`);

    await createIndexConcurrently(
      raw,
      INDEX_NAME,
      `ON "${TableName.ResourceMetadata}" ("${COLUMN_NAME}") WHERE "${COLUMN_NAME}" IS NOT NULL`
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
    await raw(`ALTER TABLE "${TableName.ResourceMetadata}" DROP CONSTRAINT IF EXISTS "${FOREIGN_KEY_NAME}"`);
    await raw(`ALTER TABLE "${TableName.ResourceMetadata}" DROP COLUMN IF EXISTS "${COLUMN_NAME}"`);
  });
}

const config = { transaction: false };
export { config };
