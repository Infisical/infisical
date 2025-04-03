import { Knex } from "knex";

import { KmsKeyIntent } from "@app/services/kms/kms-types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTypeColumn = await knex.schema.hasColumn(TableName.KmsKey, "type");

  await knex.schema.alterTable(TableName.KmsKey, (t) => {
    if (!hasTypeColumn) t.string("type").notNullable().defaultTo(KmsKeyIntent.ENCRYPT_DECRYPT);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.KmsKey, (t) => {
    t.dropColumn("type");
  });
}
