import { Knex } from "knex";

import { TableName } from "../schemas";

const SCOPE_INDEX = "idx_identity_access_token_revocations_identityid_scope";
const MIGRATION_TIMEOUT = 5 * 60 * 1000;

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    // Partial index on the scoped-marker subset so the validator's
    // `... AND (id IN (...) OR scope IN (...))` lookup gets a real index
    // path on the scope side instead of relying on the planner's row-count
    // estimate for the OR. CONCURRENTLY so the build doesn't block writes.
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS ${SCOPE_INDEX}
        ON ${TableName.IdentityAccessTokenRevocation} ("identityId", "scope")
        WHERE "scope" IS NOT NULL
    `);
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${SCOPE_INDEX}`);
}

const config = { transaction: false };
export { config };
