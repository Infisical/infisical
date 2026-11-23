import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

// Deleting a user or an identity (and so an org, which cascades to its identities) runs the ON DELETE SET NULL on
// these columns once per deleted row. Without an index each one is a sequential scan of this table, which pushes org
// deletion past the statement timeout. Partial because most versions set only one of the two actors; Postgres still
// uses them for the FK's "$1 = column" lookup, since an equality on a strict operator implies IS NOT NULL.
const INDEXES = [
  { column: "userActorId", name: "idx_secret_versions_v2_user_actor_id" },
  { column: "identityActorId", name: "idx_secret_versions_v2_identity_actor_id" }
];

export async function up(knex: Knex): Promise<void> {
  const present: typeof INDEXES = [];
  for (const index of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn(TableName.SecretVersionV2, index.column)) present.push(index);
  }

  await withMigrationConnection(knex, async (raw) => {
    for (const { column, name } of present) {
      // eslint-disable-next-line no-await-in-loop
      await createIndexConcurrently(
        raw,
        name,
        `ON "${TableName.SecretVersionV2}" ("${column}") WHERE "${column}" IS NOT NULL`
      );
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    for (const { name } of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
    }
  });
}

const config = { transaction: false };
export { config };
