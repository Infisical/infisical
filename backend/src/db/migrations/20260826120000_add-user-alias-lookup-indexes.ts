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
  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
  const lockResult = await knex.raw("SHOW lock_timeout");
  const originalLockTimeout = lockResult.rows[0].lock_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
    await knex.raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

    if (await knex.schema.hasTable(TableName.UserAliases)) {
      for await (const { name, columns } of INDEXES) {
        await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}"
          ON ${TableName.UserAliases} (${columns.join(", ")})
        `);
      }
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const { name } of INDEXES) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
  }
}

const config = { transaction: false };
export { config };
