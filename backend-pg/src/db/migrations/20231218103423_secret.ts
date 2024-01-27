import { Knex } from "knex";

import { SecretEncryptionAlgo, SecretKeyEncoding, SecretType, TableName } from "../schemas";
import { createJunctionTable, createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretBlindIndex))) {
    await knex.schema.createTable(TableName.SecretBlindIndex, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.text("encryptedSaltCipherText").notNullable();
      t.text("saltIV").notNullable();
      t.text("saltTag").notNullable();
      t.string("algorithm").notNullable().defaultTo(SecretEncryptionAlgo.AES_256_GCM);
      t.string("keyEncoding").notNullable().defaultTo(SecretKeyEncoding.UTF8);
      t.string("projectId").notNullable().unique();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretBlindIndex);

  if (!(await knex.schema.hasTable(TableName.Secret))) {
    await knex.schema.createTable(TableName.Secret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1).notNullable();
      t.string("type").notNullable().defaultTo(SecretType.Shared);
      // t.text("secretKeyHash").notNullable();
      // t.text("secretValueHash");
      // t.text("secretCommentHash");
      t.text("secretBlindIndex");
      t.text("secretKeyCiphertext").notNullable();
      t.text("secretKeyIV").notNullable();
      t.text("secretKeyTag").notNullable();
      t.text("secretValueCiphertext").notNullable();
      t.text("secretValueIV").notNullable(); // symmetric encryption
      t.text("secretValueTag").notNullable();
      t.text("secretCommentCiphertext");
      t.text("secretCommentIV");
      t.text("secretCommentTag");
      t.string("secretReminderNote");
      t.integer("secretReminderRepeatDays");
      t.boolean("skipMultilineEncoding").defaultTo(false);
      t.string("algorithm").notNullable().defaultTo(SecretEncryptionAlgo.AES_256_GCM);
      t.string("keyEncoding").notNullable().defaultTo(SecretKeyEncoding.UTF8);
      t.jsonb("metadata");
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.index("secretBlindIndex");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.Secret);
  // many to many relation between tags
  await createJunctionTable(knex, TableName.JnSecretTag, TableName.Secret, TableName.SecretTag);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretBlindIndex);
  await dropOnUpdateTrigger(knex, TableName.SecretBlindIndex);

  await knex.schema.dropTableIfExists(TableName.JnSecretTag);
  await knex.schema.dropTableIfExists(TableName.Secret);
  await dropOnUpdateTrigger(knex, TableName.Secret);
}
