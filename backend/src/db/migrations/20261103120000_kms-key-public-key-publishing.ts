import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.KmsKey, "isPublicKeyPublished"))) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.boolean("isPublicKeyPublished").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.KmsKey, "isPublicKeyPublished")) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.dropColumn("isPublicKeyPublished");
    });
  }
}
