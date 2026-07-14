import { Knex } from "knex";

import { TableName } from "../schemas";

// Drops the redundant secret_versions_v2.envId column together with its FK
// (secret_versions_v2_envid_foreign -> project_environments ON DELETE CASCADE) and the partial index
// idx_secret_versions_v2_envid that backed that cascade.
const COLUMN_NAME = "envId";
const FK_NAME = "secret_versions_v2_envid_foreign";
const INDEX_NAME = "idx_secret_versions_v2_envid";
const DROP_LOCK_TIMEOUT = 5 * 1000; // fail fast rather than queue behind writes on a hot table

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretVersionV2))) return;

  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);

  if (await knex.schema.hasColumn(TableName.SecretVersionV2, COLUMN_NAME)) {
    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL lock_timeout = ${DROP_LOCK_TIMEOUT}`);
      await tx.raw(
        `ALTER TABLE ${TableName.SecretVersionV2} DROP CONSTRAINT IF EXISTS "${FK_NAME}", DROP COLUMN IF EXISTS "${COLUMN_NAME}"`
      );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretVersionV2))) return;

  if (!(await knex.schema.hasColumn(TableName.SecretVersionV2, COLUMN_NAME))) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.uuid(COLUMN_NAME);
    });
  }

  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${DROP_LOCK_TIMEOUT}`);
    await tx.raw(`
      DO $$ BEGIN
        ALTER TABLE ${TableName.SecretVersionV2}
          ADD CONSTRAINT "${FK_NAME}" FOREIGN KEY ("${COLUMN_NAME}")
          REFERENCES ${TableName.Environment}(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  });

  // A prior failed CREATE INDEX CONCURRENTLY can leave an INVALID index that CREATE ... IF NOT EXISTS
  // would then skip, leaving it permanently invalid. Drop any leftover first so recreation is retry-safe.
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}"
    ON ${TableName.SecretVersionV2} ("${COLUMN_NAME}")
    WHERE "${COLUMN_NAME}" IS NOT NULL
  `);
}

const config = { transaction: false };
export { config };
