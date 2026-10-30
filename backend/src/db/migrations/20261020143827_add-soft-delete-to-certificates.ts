import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

const DELETED_INDEX_NAME = "certificates_projectid_deleted_index";
const DELETION_AWARE_QUOTA_KEY_INDEX = "certificates_projectid_quotakey_deletion_index";
const LEGACY_QUOTA_KEY_INDEX = "certificates_projectid_quotakey_index";
const KEY_SOURCE_CHECK_NAME = "certificates_key_source_chk";
const LIVE_KEY_SOURCE_CHECK = `("keySource" = 'infisical') OR ("keySource" = 'hsm' AND "hsmConnectorId" IS NOT NULL AND "hsmKeyLabel" IS NOT NULL)`;
const SOFT_DELETE_KEY_SOURCE_CHECK = `("keySource" = 'infisical') OR ("keySource" = 'hsm' AND "hsmKeyLabel" IS NOT NULL AND ("hsmConnectorId" IS NOT NULL OR "deletedAt" IS NOT NULL))`;

const ALTER_LOCK_TIMEOUT = 10 * 1000;

const replaceKeySourceCheck = async (tx: Knex, checkExpression: string) => {
  await tx.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [TableName.Certificate, KEY_SOURCE_CHECK_NAME]);
  await tx.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${checkExpression}) NOT VALID`, [
    TableName.Certificate,
    KEY_SOURCE_CHECK_NAME
  ]);
};

export async function up(knex: Knex): Promise<void> {
  const hasDeletedAt = await knex.schema.hasColumn(TableName.Certificate, "deletedAt");

  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    if (!hasDeletedAt) {
      await tx.schema.alterTable(TableName.Certificate, (t) => {
        t.datetime("deletedAt", { useTz: true }).nullable();
        t.string("deletedByActorType").nullable();
        t.uuid("deletedByActorId").nullable();
      });
    }
    await replaceKeySourceCheck(tx, SOFT_DELETE_KEY_SOURCE_CHECK);
  });

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

  const hasDeletedAt = await knex.schema.hasColumn(TableName.Certificate, "deletedAt");

  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await tx.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [TableName.Certificate, KEY_SOURCE_CHECK_NAME]);
    if (hasDeletedAt) {
      await tx.schema.alterTable(TableName.Certificate, (t) => {
        t.dropColumn("deletedAt");
        t.dropColumn("deletedByActorType");
        t.dropColumn("deletedByActorId");
      });
    }
    await replaceKeySourceCheck(tx, LIVE_KEY_SOURCE_CHECK);
  });
}

const config = { transaction: false };
export { config };
