import { Knex } from "knex";

import { TableName } from "../schemas";

// Sessions launched by machine identities need a machine-readable actor link, mirroring userId.
// SET NULL keeps session history alive after identity deletion (actorName carries the display name).
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamSession, "identityId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      t.uuid("identityId").nullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      // FK columns must be indexed (Postgres does not auto-index them); partial since most sessions are user-launched
      t.index("identityId", "pam_sessions_identityid_index", {
        predicate: knex.whereNotNull("identityId")
      });
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamSession, "identityId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      t.dropColumn("identityId");
    });
  }
}
