/** Key-import metadata keeps the declared encryption algorithm separate from kms_keys. */
import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.KmsKeyImportMeta))) {
    await knex.schema.createTable(TableName.KmsKeyImportMeta, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("keyId").notNullable().references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
      t.string("encryptionAlgorithm").notNullable();
      t.timestamps(true, true, true);
      t.unique(["keyId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.KmsKeyImportMeta);
}
