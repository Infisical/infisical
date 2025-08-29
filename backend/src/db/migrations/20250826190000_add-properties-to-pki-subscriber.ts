import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasPropertiesCol = await knex.schema.hasColumn(TableName.PkiSubscriber, "properties");

  if (!hasPropertiesCol) {
    await knex.schema.alterTable(TableName.PkiSubscriber, (t) => {
      t.jsonb("properties").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPropertiesCol = await knex.schema.hasColumn(TableName.PkiSubscriber, "properties");

  if (hasPropertiesCol) {
    await knex.schema.alterTable(TableName.PkiSubscriber, (t) => {
      t.dropColumn("properties");
    });
  }
}
