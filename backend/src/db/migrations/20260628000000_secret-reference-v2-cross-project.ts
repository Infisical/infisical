import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretReferenceV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretReferenceV2, "targetProjectSlug");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretReferenceV2, (t) => {
        t.string("targetProjectSlug").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretReferenceV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretReferenceV2, "targetProjectSlug");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretReferenceV2, (t) => {
        t.dropColumn("targetProjectSlug");
      });
    }
  }
}
