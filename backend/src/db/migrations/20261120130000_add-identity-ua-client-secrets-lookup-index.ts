import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

// Universal auth login finds candidate secrets by identityUAId and prefix, and the table had no index on either, so
// every login scanned it. Not partial on isClientSecretRevoked: revoked rows are purged daily, and the full index also
// serves the ON DELETE CASCADE from identity_universal_auth.
const INDEX_NAME = "idx_identity_ua_client_secrets_lookup";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityUaClientSecret))) return;

  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      INDEX_NAME,
      `ON "${TableName.IdentityUaClientSecret}" ("identityUAId", "clientSecretPrefix")`
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
  });
}

const config = { transaction: false };
export { config };
