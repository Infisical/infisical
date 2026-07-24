import { Knex } from "knex";

import { TableName } from "../schemas";

// Two unindexed foreign keys that the billable org-actor count leans on:
//   - organizations.rootOrgId: the count resolves an org plus its sub-orgs via
//     "id = :orgId OR rootOrgId = :orgId"; without this index the OR branch seq-scans
//     every organization.
//   - identities.orgId: the count enumerates an org's identities; without this index it
//     seq-scans the whole identities table.
// Both feed the identity-creation quota gate on the hot path, so index them.
const ROOT_ORG_ID_INDEX = "idx_organizations_root_org_id";
const IDENTITY_ORG_ID_INDEX = "idx_identities_org_id";
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

    if (await knex.schema.hasColumn(TableName.Organization, "rootOrgId")) {
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${ROOT_ORG_ID_INDEX}"
        ON ${TableName.Organization} ("rootOrgId")
        WHERE "rootOrgId" IS NOT NULL
      `);
    }

    if (await knex.schema.hasColumn(TableName.Identity, "orgId")) {
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${IDENTITY_ORG_ID_INDEX}"
        ON ${TableName.Identity} ("orgId")
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${ROOT_ORG_ID_INDEX}"`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${IDENTITY_ORG_ID_INDEX}"`);
}

const config = { transaction: false };
export { config };
