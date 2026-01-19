import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.ResourceMetadata);
  const hasEncryptedValueColumn = await knex.schema.hasColumn(TableName.ResourceMetadata, "encryptedValue");
  const hasValueColumn = await knex.schema.hasColumn(TableName.ResourceMetadata, "value");

  if (hasTable) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (t) => {
      if (!hasEncryptedValueColumn) t.binary("encryptedValue").nullable();
      if (hasValueColumn) t.string("value", 1020).nullable().alter();
      t.check(
        `(value IS NOT NULL AND "encryptedValue" IS NULL) OR (value IS NULL AND "encryptedValue" IS NOT NULL)`,
        [],
        "chk_value_or_encrypted_value"
      );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.ResourceMetadata);
  const hasEncryptedValueColumn = await knex.schema.hasColumn(TableName.ResourceMetadata, "encryptedValue");

  if (hasTable) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (t) => {
      if (hasEncryptedValueColumn) {
        t.dropChecks(["chk_value_or_encrypted_value"]);
        t.dropColumn("encryptedValue");
      }
    });
  }
}
