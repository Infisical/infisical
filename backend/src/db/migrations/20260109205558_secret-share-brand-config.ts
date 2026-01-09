import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "secretShareBrandConfig");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.jsonb("secretShareBrandConfig").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "secretShareBrandConfig");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("secretShareBrandConfig");
    });
  }
}
