import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

// Deleting an identity (and so an org, which cascades to its identities) runs the ON DELETE CASCADE on this column
// once per deleted identity. The only index holding it leads with "scope", so each one scans the whole table. Partial
// because user and group memberships leave it null.
const INDEX_NAME = "idx_memberships_actor_identity_id";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Membership, "actorIdentityId"))) return;

  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      INDEX_NAME,
      `ON "${TableName.Membership}" ("actorIdentityId") WHERE "actorIdentityId" IS NOT NULL`
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
