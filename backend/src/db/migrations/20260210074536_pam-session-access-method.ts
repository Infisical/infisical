import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    const hasCol = await knex.schema.hasColumn(TableName.PamSession, "accessMethod");
    if (!hasCol) {
      await knex.schema.alterTable(TableName.PamSession, (t) => {
        t.string("accessMethod").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    const hasCol = await knex.schema.hasColumn(TableName.PamSession, "accessMethod");
    if (hasCol) {
      await knex.schema.alterTable(TableName.PamSession, (t) => {
        t.dropColumn("accessMethod");
      });
    }
  }
}
