import { Knex } from "knex";

import { TableName } from "../schemas";

// Records the user-selected target for domain-account sessions (e.g. AD), which
// have no owning resource of their own.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    const hasCol = await knex.schema.hasColumn(TableName.PamSession, "selectedResourceId");
    if (!hasCol) {
      await knex.schema.alterTable(TableName.PamSession, (t) => {
        t.uuid("selectedResourceId").nullable().references("id").inTable(TableName.PamResource).onDelete("SET NULL");
        t.index("selectedResourceId");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    const hasCol = await knex.schema.hasColumn(TableName.PamSession, "selectedResourceId");
    if (hasCol) {
      await knex.schema.alterTable(TableName.PamSession, (t) => {
        t.dropIndex("selectedResourceId");
        t.dropColumn("selectedResourceId");
      });
    }
  }
}
