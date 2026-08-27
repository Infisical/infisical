import { Knex } from "knex";

import { TableName } from "../schemas";

const ORDER_ID_INDEX = "certificates_orderid_index";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  const connection = await knex.client.acquireConnection();
  const raw = (sql: string) => knex.raw(sql).connection(connection);

  try {
    const stmtResult = await raw("SHOW statement_timeout");
    const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
    const lockResult = await raw("SHOW lock_timeout");
    const originalLockTimeout = lockResult.rows[0].lock_timeout;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      await raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

      if (!(await knex.schema.hasColumn(TableName.Certificate, "orderId"))) {
        await raw(`ALTER TABLE "${TableName.Certificate}" ADD COLUMN "orderId" uuid`);
      }

      await raw(`ALTER TABLE "${TableName.Certificate}" ALTER COLUMN "orderId" SET DEFAULT gen_random_uuid()`);

      await raw(`
        WITH RECURSIVE ranked AS (
          SELECT id, "renewedFromCertificateId",
                 ROW_NUMBER() OVER (PARTITION BY "renewedFromCertificateId" ORDER BY "createdAt", id) AS sibling_rank
          FROM "${TableName.Certificate}"
        ),
        chain AS (
          SELECT c.id, COALESCE(c."orderId", gen_random_uuid()) AS "orderId"
          FROM "${TableName.Certificate}" c
          INNER JOIN ranked r ON r.id = c.id
          WHERE c."renewedFromCertificateId" IS NULL OR r.sibling_rank > 1
          UNION ALL
          SELECT c.id, chain."orderId"
          FROM "${TableName.Certificate}" c
          INNER JOIN ranked r ON r.id = c.id
          INNER JOIN chain ON c."renewedFromCertificateId" = chain.id
          WHERE r.sibling_rank = 1
        )
        UPDATE "${TableName.Certificate}" AS target
        SET "orderId" = chain."orderId"
        FROM chain
        WHERE target.id = chain.id
          AND target."orderId" IS DISTINCT FROM chain."orderId"
      `);

      await raw(`UPDATE "${TableName.Certificate}" SET "orderId" = gen_random_uuid() WHERE "orderId" IS NULL`);

      const invalid = await raw(
        `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${ORDER_ID_INDEX}' AND NOT i.indisvalid`
      );
      if (invalid.rows.length > 0) {
        await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${ORDER_ID_INDEX}"`);
      }

      await raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${ORDER_ID_INDEX}"
        ON "${TableName.Certificate}" ("orderId")
      `);

      await raw(`ALTER TABLE "${TableName.Certificate}" ALTER COLUMN "orderId" SET NOT NULL`);
    } finally {
      await raw(`SET statement_timeout = '${originalStatementTimeout}'`);
      await raw(`SET lock_timeout = '${originalLockTimeout}'`);
    }
  } finally {
    await knex.client.releaseConnection(connection);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${ORDER_ID_INDEX}"`);

  if (await knex.schema.hasColumn(TableName.Certificate, "orderId")) {
    await knex.raw(`ALTER TABLE "${TableName.Certificate}" DROP COLUMN "orderId"`);
  }
}

const config = { transaction: false };
export { config };
