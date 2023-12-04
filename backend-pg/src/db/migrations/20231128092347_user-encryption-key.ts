import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.UserEncryptionKey);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.UserEncryptionKey, (t) => {
      t.increments().primary();
      t.text("clientPublicKey");
      t.text("serverPrivateKey");
      t.text("encryptionVersion").defaultTo(1);
      t.text("protectedKey").notNullable();
      t.text("protectedKeyIV").notNullable();
      t.text("protectedKeyTag").notNullable();
      t.text("publicKey").notNullable();
      t.text("encryptedPrivateKey").notNullable();
      t.text("iv").notNullable();
      t.text("tag").notNullable();
      t.text("salt").notNullable();
      t.text("verifier").notNullable();
      // one to one relationship
      t.uuid("userId").notNullable().unique();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserEncryptionKey);
}
