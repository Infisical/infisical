import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmsKey)) {
    const hasSlug = await knex.schema.hasColumn(TableName.KmsKey, "slug");

    if (!hasSlug) {
      // add slug back temporarily and set value equal to name
      await knex.schema
        .alterTable(TableName.KmsKey, (table) => {
          table.string("slug", 32);
        })
        .then(() => knex(TableName.KmsKey).update("slug", knex.ref("name")));
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmsKey)) {
    const hasSlug = await knex.schema.hasColumn(TableName.KmsKey, "slug");

    if (hasSlug) {
      await knex.schema.alterTable(TableName.KmsKey, (table) => {
        table.dropColumn("slug");
      });
    }
  }
}
