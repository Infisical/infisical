import { Knex } from "knex";

import { TableName } from "../schemas";

// auth_token_sessions carries a row per user session, so it is one of the largest tables on an
// instance, and until now the primary key was its only index. Every lookup keyed on `id` rides that
// PK (session validation on each authenticated request, refresh rotation, revoking one session), but
// three filter shapes had nothing to use and seq-scanned the whole table:
//
//   {userAgent}              revokeSessionsByUserAgent, the only handle OAuth client revocation has
//                            on the tokens a client issued. Two of its callers run inside a
//                            transaction, so the scan also held a pooled connection for its duration.
//   {userId, ip, userAgent}  getUserTokenSession, on every login and every RFC 8693 token exchange.
//   {userId}                 listing a user's sessions, and revoking all of them.
//
// The second index covers both of the userId shapes: the three-column lookup uses all of it, and the
// userId-only lookups use its leftmost column. userAgent trails rather than leads it so that the
// userAgent-only delete keeps its own tighter single-column index, which measured consistently faster
// for that query than sharing a userAgent-leading composite.
const USER_AGENT_INDEX = "idx_auth_token_sessions_user_agent";
const USER_SESSION_INDEX = "idx_auth_token_sessions_user_id_ip_user_agent";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  // statement_timeout / lock_timeout are session-local, so every statement here has to run on the
  // same pooled connection as the CREATE INDEX CONCURRENTLY calls they are meant to govern.
  const connection = await knex.client.acquireConnection();
  const raw = (sql: string) => knex.raw(sql).connection(connection);

  // A cancelled or failed CREATE INDEX CONCURRENTLY leaves behind an INVALID index that
  // IF NOT EXISTS would happily skip over, so drop it before retrying.
  const dropIfInvalid = async (indexName: string) => {
    const invalid = await raw(
      `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${indexName}' AND NOT i.indisvalid`
    );
    if (invalid.rows.length > 0) {
      await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
    }
  };

  try {
    const stmtResult = await raw("SHOW statement_timeout");
    const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
    const lockResult = await raw("SHOW lock_timeout");
    const originalLockTimeout = lockResult.rows[0].lock_timeout;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      await raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

      if (await knex.schema.hasColumn(TableName.AuthTokenSession, "userAgent")) {
        await dropIfInvalid(USER_AGENT_INDEX);
        await raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${USER_AGENT_INDEX}"
          ON ${TableName.AuthTokenSession} ("userAgent")
        `);

        await dropIfInvalid(USER_SESSION_INDEX);
        await raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${USER_SESSION_INDEX}"
          ON ${TableName.AuthTokenSession} ("userId", "ip", "userAgent")
        `);
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
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${USER_AGENT_INDEX}"`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${USER_SESSION_INDEX}"`);
}

const config = { transaction: false };
export { config };
