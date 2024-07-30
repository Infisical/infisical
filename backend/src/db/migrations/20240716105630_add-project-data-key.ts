import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasKmsSecretManagerEncryptedDataKey = await knex.schema.hasColumn(
    TableName.Project,
    "kmsSecretManagerEncryptedDataKey"
  );

  await knex.schema.alterTable(TableName.Project, (tb) => {
    if (!hasKmsSecretManagerEncryptedDataKey) {
      tb.binary("kmsSecretManagerEncryptedDataKey");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasKmsSecretManagerEncryptedDataKey = await knex.schema.hasColumn(
    TableName.Project,
    "kmsSecretManagerEncryptedDataKey"
  );

  await knex.schema.alterTable(TableName.Project, (t) => {
    if (hasKmsSecretManagerEncryptedDataKey) {
      t.dropColumn("kmsSecretManagerEncryptedDataKey");
    }
  });
}
