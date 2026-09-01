import { Knex } from "knex";

import { TableName } from "../schemas";

// user_group_membership carried nothing but its primary key, leaving both of its foreign keys
// unindexed on a table that sits in the middle of every group-expanded access check:
//   - groupId: expanding a group to its members (alert recipient resolution on every send,
//     removing a group from a scope) and joining the table to a group's project membership.
//   - userId: resolving which groups a user belongs to, and the group-inherited half of the
//     effective-project-membership check.
// Both were seq scans of the whole table. groupId is paired with userId so the composite also
// serves the groupId-only lookups as a leftmost prefix.
const GROUP_ID_USER_ID_INDEX = "idx_user_group_membership_group_id_user_id";
const USER_ID_INDEX = "idx_user_group_membership_user_id";
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

    if (await knex.schema.hasColumn(TableName.UserGroupMembership, "groupId")) {
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${GROUP_ID_USER_ID_INDEX}"
        ON ${TableName.UserGroupMembership} ("groupId", "userId")
      `);
    }

    if (await knex.schema.hasColumn(TableName.UserGroupMembership, "userId")) {
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${USER_ID_INDEX}"
        ON ${TableName.UserGroupMembership} ("userId")
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${GROUP_ID_USER_ID_INDEX}"`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${USER_ID_INDEX}"`);
}

const config = { transaction: false };
export { config };
