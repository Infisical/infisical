import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmsKey)) {
    const hasSlugCol = await knex.schema.hasColumn(TableName.KmsKey, "slug");

    if (hasSlugCol) {
      await knex.schema.alterTable(TableName.KmsKey, (t) => {
        t.dropColumn("slug");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmsKey)) {
    const hasSlugCol = await knex.schema.hasColumn(TableName.KmsKey, "slug");

    if (!hasSlugCol) {
      await knex.schema.alterTable(TableName.KmsKey, (t) => {
        t.string("slug", 32);
      });
    }
  }
}
