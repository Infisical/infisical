import { Knex } from "knex";

const MIGRATION_STATEMENT_TIMEOUT = 60 * 60 * 1000;
const MIGRATION_LOCK_TIMEOUT = 30 * 1000;

export type TMigrationRaw = (sql: string) => Knex.Raw;

export const withMigrationConnection = async (knex: Knex, run: (raw: TMigrationRaw) => Promise<void>) => {
  const connection = await knex.client.acquireConnection();
  const raw: TMigrationRaw = (sql) => knex.raw(sql).connection(connection);

  try {
    const stmtResult = await raw("SHOW statement_timeout");
    const originalStatementTimeout = stmtResult.rows[0].statement_timeout as string;
    const lockResult = await raw("SHOW lock_timeout");
    const originalLockTimeout = lockResult.rows[0].lock_timeout as string;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_STATEMENT_TIMEOUT}`);
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

export const createIndexConcurrently = async (raw: TMigrationRaw, name: string, definition: string) => {
  const invalid = await raw(
    `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${name}' AND NOT i.indisvalid`
  );
  if (invalid.rows.length > 0) {
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
  }
  await raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ${definition}`);
};
