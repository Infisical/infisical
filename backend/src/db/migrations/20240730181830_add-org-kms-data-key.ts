import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasKmsDataKeyCol = await knex.schema.hasColumn(TableName.Organization, "kmsEncryptedDataKey");
  await knex.schema.alterTable(TableName.Organization, (tb) => {
    if (!hasKmsDataKeyCol) {
      tb.binary("kmsEncryptedDataKey");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasKmsDataKeyCol = await knex.schema.hasColumn(TableName.Organization, "kmsEncryptedDataKey");
  await knex.schema.alterTable(TableName.Organization, (t) => {
    if (hasKmsDataKeyCol) {
      t.dropColumn("kmsEncryptedDataKey");
    }
  });
}
