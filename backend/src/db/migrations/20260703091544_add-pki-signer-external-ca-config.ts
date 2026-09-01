import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PkiSigners, "externalCaConfig");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.jsonb("externalCaConfig");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PkiSigners, "externalCaConfig");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.dropColumn("externalCaConfig");
    });
  }
}
