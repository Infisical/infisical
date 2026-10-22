import { Knex } from "knex";

import { TableName } from "../schemas";

const DELETED_INDEX_NAME = "certificates_projectid_deleted_index";
const DELETION_AWARE_QUOTA_KEY_INDEX = "certificates_projectid_quotakey_deletion_index";
const LEGACY_QUOTA_KEY_INDEX = "certificates_projectid_quotakey_index";
const KEY_SOURCE_CHECK_NAME = "certificates_key_source_chk";
const LIVE_HSM_KEY_SOURCE_CHECK = `("keySource" = 'infisical') OR ("keySource" = 'hsm' AND "hsmConnectorId" IS NOT NULL AND "hsmKeyLabel" IS NOT NULL)`;
const SOFT_DELETE_HSM_KEY_SOURCE_CHECK = `("keySource" = 'infisical') OR ("keySource" = 'hsm' AND "hsmKeyLabel" IS NOT NULL AND ("hsmConnectorId" IS NOT NULL OR "deletedAt" IS NOT NULL))`;

const ALTER_LOCK_TIMEOUT = 10 * 1000;
const MIGRATION_TIMEOUT = 60 * 60 * 1000;
const MIGRATION_LOCK_TIMEOUT = 30 * 1000;

const withMigrationConnection = async (knex: Knex, run: (raw: (sql: string) => Knex.Raw) => Promise<void>) => {
  const connection = await knex.client.acquireConnection();
  const raw = (sql: string) => knex.raw(sql).connection(connection);

  try {
    const stmtResult = await raw("SHOW statement_timeout");
    const originalStatementTimeout = stmtResult.rows[0].statement_timeout as string;
    const lockResult = await raw("SHOW lock_timeout");
    const originalLockTimeout = lockResult.rows[0].lock_timeout as string;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      await raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);
      await run(raw);
    } finally {
      await raw(`SET statement_timeout = '${originalStatementTimeout}'`);
      await raw(`SET lock_timeout = '${originalLockTimeout}'`);
    }
  } finally {
    await knex.client.releaseConnection(connection);
  }
};

const createIndexConcurrently = async (raw: (sql: string) => Knex.Raw, name: string, definition: string) => {
  const invalid = await raw(
    `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${name}' AND NOT i.indisvalid`
  );
  if (invalid.rows.length > 0) {
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
  }
  await raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ${definition}`);
};

const replaceKeySourceCheck = async (knex: Knex, checkExpression: string) => {
  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await tx.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [TableName.Certificate, KEY_SOURCE_CHECK_NAME]);
    await tx.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${checkExpression}) NOT VALID`, [
      TableName.Certificate,
      KEY_SOURCE_CHECK_NAME
    ]);
  });

  await withMigrationConnection(knex, async (raw) => {
    await raw(`ALTER TABLE "${TableName.Certificate}" VALIDATE CONSTRAINT "${KEY_SOURCE_CHECK_NAME}"`);
  });
};

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await tx.raw(
      `ALTER TABLE ?? ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz, ADD COLUMN IF NOT EXISTS "deletedByActorType" varchar(255), ADD COLUMN IF NOT EXISTS "deletedByActorId" uuid, ADD COLUMN IF NOT EXISTS "deletedVia" varchar(255)`,
      [TableName.Certificate]
    );
    await tx.raw(
      `ALTER TABLE ?? ADD COLUMN IF NOT EXISTS "restoreDeletedCertificates" boolean NOT NULL DEFAULT false`,
      [TableName.PkiDiscoveryConfig]
    );
  });

  await replaceKeySourceCheck(knex, SOFT_DELETE_HSM_KEY_SOURCE_CHECK);

  const hasQuotaKey = await knex.schema.hasColumn(TableName.Certificate, "quotaKey");
  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      DELETED_INDEX_NAME,
      `ON "${TableName.Certificate}" ("projectId") WHERE "deletedAt" IS NOT NULL`
    );

    if (hasQuotaKey) {
      await createIndexConcurrently(
        raw,
        DELETION_AWARE_QUOTA_KEY_INDEX,
        `ON "${TableName.Certificate}" ("projectId", "quotaKey") INCLUDE ("notAfter", "status", "hasWildcard", "deletedAt", "source")`
      );
      await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${LEGACY_QUOTA_KEY_INDEX}"`);
    }

    await raw(`ANALYZE "${TableName.Certificate}" ("deletedAt")`);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasQuotaKey = await knex.schema.hasColumn(TableName.Certificate, "quotaKey");
  await withMigrationConnection(knex, async (raw) => {
    if (hasQuotaKey) {
      await createIndexConcurrently(
        raw,
        LEGACY_QUOTA_KEY_INDEX,
        `ON "${TableName.Certificate}" ("projectId", "quotaKey") INCLUDE ("notAfter", "status", "hasWildcard")`
      );
      await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${DELETION_AWARE_QUOTA_KEY_INDEX}"`);
    }
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${DELETED_INDEX_NAME}"`);
  });

  if (await knex.schema.hasColumn(TableName.Certificate, "deletedAt")) {
    await knex(TableName.Certificate).whereNotNull("deletedAt").delete();
    await replaceKeySourceCheck(knex, LIVE_HSM_KEY_SOURCE_CHECK);
  }

  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await tx.raw(
      `ALTER TABLE ?? DROP COLUMN IF EXISTS "deletedAt", DROP COLUMN IF EXISTS "deletedByActorType", DROP COLUMN IF EXISTS "deletedByActorId", DROP COLUMN IF EXISTS "deletedVia"`,
      [TableName.Certificate]
    );
    await tx.raw(`ALTER TABLE ?? DROP COLUMN IF EXISTS "restoreDeletedCertificates"`, [TableName.PkiDiscoveryConfig]);
  });
}

const config = { transaction: false };
export { config };
