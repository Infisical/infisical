import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.KmsKey, "kmipMetadata"))) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.jsonb("kmipMetadata");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.KmsKey, "kmipMetadata")) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.dropColumn("kmipMetadata");
    });
  }
}
