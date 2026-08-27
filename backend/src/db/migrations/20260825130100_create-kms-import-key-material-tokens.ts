import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasImportTokens = await knex.schema.hasTable(TableName.KmsImportKeyMaterialToken);
  if (!hasImportTokens) {
    await knex.schema.createTable(TableName.KmsImportKeyMaterialToken, (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("keyId").notNullable().references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
      t.binary("encryptedKey").notNullable();
      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("expiresAt", { useTz: true }).notNullable();
      t.text("wrapAlgorithm").notNullable();
      t.text("wrapKey").notNullable();
      t.boolean("isUtilized").notNullable().defaultTo(false);
      t.index("keyId");
      t.index("expiresAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasImportTokens = await knex.schema.hasTable(TableName.KmsImportKeyMaterialToken);
  if (hasImportTokens) {
    await knex.schema.dropTable(TableName.KmsImportKeyMaterialToken);
  }
}
