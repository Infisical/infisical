import { Knex } from "knex";

import { TableName } from "../schemas";

const UNIQUE_INDEX_NAME = "users_username_lower_unique";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
  const lockResult = await knex.raw("SHOW lock_timeout");
  const originalLockTimeout = lockResult.rows[0].lock_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
    await knex.raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

    // Normalize any remaining non-lowercase usernames before adding the unique index.
    // This handles rows that slipped through previous migrations or were created by
    // SSO re-auth paths that didn't normalize.
    await knex.raw(`
      UPDATE ${TableName.Users}
      SET username = LOWER(username), email = LOWER(email)
      WHERE username != LOWER(username)
        AND "isGhost" = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM ${TableName.Users} u2
          WHERE u2.username = LOWER(${TableName.Users}.username)
            AND u2.id != ${TableName.Users}.id
        )
    `);

    await knex.raw(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${UNIQUE_INDEX_NAME}"
      ON ${TableName.Users} (LOWER(username))
      WHERE "isGhost" = FALSE
    `);
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${UNIQUE_INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
