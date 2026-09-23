import { Knex } from "knex";

import { TableName } from "../schemas";

// user_aliases only had its primary key and the partial unique index on the social alias types, so
// both FKs were unindexed and every org-scoped SSO login lookup was a seq scan. Between them these
// two cover every query shape against the table. Column order matters: leading with orgId and
// userId is what covers the two FKs, which Postgres doesn't index for you.
const INDEXES = [
  { name: "idx_user_aliases_org_alias_type_external_id", columns: ['"orgId"', '"aliasType"', '"externalId"'] },
  { name: "idx_user_aliases_user_org_alias_type", columns: ['"userId"', '"orgId"', '"aliasType"'] }
];

const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  // statement_timeout / lock_timeout are session-local, so they have to run on the same pooled
  // connection as the CREATE INDEX CONCURRENTLY calls they govern.
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

      if (await knex.schema.hasTable(TableName.UserAliases)) {
        for (const { name, columns } of INDEXES) {
          // A cancelled or failed CREATE INDEX CONCURRENTLY leaves behind an INVALID index that
          // IF NOT EXISTS would happily skip over, so drop it before retrying.
          // eslint-disable-next-line no-await-in-loop
          const invalid = await raw(
            `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${name}' AND NOT i.indisvalid`
          );
          if (invalid.rows.length > 0) {
            // eslint-disable-next-line no-await-in-loop
            await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
          }

          // eslint-disable-next-line no-await-in-loop
          await raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}"
            ON ${TableName.UserAliases} (${columns.join(", ")})
          `);
        }
      }
    } finally {
      await raw(`SET statement_timeout = '${originalStatementTimeout}'`);
      await raw(`SET lock_timeout = '${originalLockTimeout}'`);
    }
  } finally {
    await knex.client.releaseConnection(connection);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { name } of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
  }
}

const config = { transaction: false };
export { config };
