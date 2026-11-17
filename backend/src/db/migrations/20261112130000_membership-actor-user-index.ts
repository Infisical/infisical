import { Knex } from "knex";

import { TableName } from "../schemas";

// memberships."actorUserId" and "actorGroupId" are CASCADE foreign keys with no index leading on them, so
// every user or group delete, and every user membership lookup (filtered by actorUserId and scope),
// seq-scans the whole table. scope rides along for those lookups. Partial because the actor xor check
// leaves each column null on the other actors' rows.

const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

const INDEXES = [
  { name: "idx_memberships_actor_user_id_scope", column: "actorUserId" },
  { name: "idx_memberships_actor_group_id_scope", column: "actorGroupId" }
] as const;

export async function up(knex: Knex): Promise<void> {
  const connection = await knex.client.acquireConnection();
  const raw = (sql: string) => knex.raw(sql).connection(connection);

  try {
    const originalStatementTimeout = (await raw("SHOW statement_timeout")).rows[0].statement_timeout;
    const originalLockTimeout = (await raw("SHOW lock_timeout")).rows[0].lock_timeout;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      await raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

      for (const { name, column } of INDEXES) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await knex.schema.connection(connection).hasColumn(TableName.Membership, column))) {
          // eslint-disable-next-line no-continue
          continue;
        }

        // A cancelled or failed CREATE INDEX CONCURRENTLY leaves an INVALID index that IF NOT EXISTS would keep.
        // eslint-disable-next-line no-await-in-loop
        const invalid = await raw(
          `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${name}' AND NOT i.indisvalid`
        );
        if (invalid.rows.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
        }

        // eslint-disable-next-line no-await-in-loop
        await raw(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON ${TableName.Membership} ("${column}", "scope") WHERE "${column}" IS NOT NULL`
        );
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
