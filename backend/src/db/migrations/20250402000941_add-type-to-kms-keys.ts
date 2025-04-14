import { Knex } from "knex";

import { KmsKeyUsage } from "@app/services/kms/kms-types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasKeyUsageColumn = await knex.schema.hasColumn(TableName.KmsKey, "keyUsage");

  await knex.schema.alterTable(TableName.KmsKey, (t) => {
    if (!hasKeyUsageColumn) t.string("keyUsage").notNullable().defaultTo(KmsKeyUsage.ENCRYPT_DECRYPT);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasKeyUsageColumn = await knex.schema.hasColumn(TableName.KmsKey, "keyUsage");

  await knex.schema.alterTable(TableName.KmsKey, (t) => {
    if (hasKeyUsageColumn) {
      t.dropColumn("keyUsage");
    }
  });
}
