import { Knex } from "knex";

import { SecretEncryptionAlgo, SecretKeyEncoding, SecretType, TableName } from "../schemas";
import { createJunctionTable, createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretVersion))) {
    await knex.schema.createTable(TableName.SecretVersion, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1);
      t.string("type").notNullable().defaultTo(SecretType.Shared);
      // t.text("secretKeyHash").notNullable();
      // t.text("secretValueHash");
      // t.text("secretCommentHash");
      t.text("secretBlindIndex").notNullable();
      t.text("secretKeyCiphertext").notNullable();
      t.text("secretKeyIV").notNullable();
      t.text("secretKeyTag").notNullable();
      t.text("secretValueCiphertext").notNullable();
      t.text("secretValueIV").notNullable(); // symmetric encryption
      t.text("secretValueTag").notNullable();
      t.text("secretCommentCiphertext");
      t.text("secretCommentIV");
      t.text("secretCommentTag");
      t.string("secretReminderNotice");
      t.integer("secretReminderRepeatDays");
      t.boolean("skipMultilineEncoding").defaultTo(false);
      t.string("algorithm").notNullable().defaultTo(SecretEncryptionAlgo.AES_256_GCM);
      t.string("keyEncoding").notNullable().defaultTo(SecretKeyEncoding.UTF8);
      t.jsonb("metadata");
      t.uuid("secretId");
      t.foreign("secretId").references("id").inTable(TableName.Secret).onDelete("SET NULL");
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretVersion);
  // many to many relation between tags
  await createJunctionTable(
    knex,
    TableName.JnSecretVersionTag,
    TableName.SecretVersion,
    TableName.SecretTag
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.JnSecretVersionTag);
  await knex.schema.dropTableIfExists(TableName.SecretVersion);
  await dropOnUpdateTrigger(knex, TableName.SecretVersion);
}
