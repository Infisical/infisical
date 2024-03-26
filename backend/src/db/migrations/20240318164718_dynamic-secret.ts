import { Knex } from "knex";

import { SecretEncryptionAlgo, SecretKeyEncoding, TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const doesTableExist = await knex.schema.hasTable(TableName.DynamicSecret);
  if (!doesTableExist) {
    await knex.schema.createTable(TableName.DynamicSecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.integer("version").notNullable();
      t.string("type").notNullable();
      t.string("defaultTTL").notNullable();
      t.string("maxTTL");
      t.string("inputIV").notNullable();
      t.text("inputCiphertext").notNullable();
      t.string("inputTag").notNullable();
      t.string("algorithm").notNullable().defaultTo(SecretEncryptionAlgo.AES_256_GCM);
      t.string("keyEncoding").notNullable().defaultTo(SecretKeyEncoding.UTF8);
      t.uuid("folderId").notNullable();
      // for background process communication
      t.string("status");
      t.string("statusDetails");
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.unique(["name", "folderId"]);
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.DynamicSecret);

  const doesTableDynamicSecretLease = await knex.schema.hasTable(TableName.DynamicSecretLease);
  if (!doesTableDynamicSecretLease) {
    await knex.schema.createTable(TableName.DynamicSecretLease, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").notNullable();
      t.string("externalEntityId").notNullable();
      t.datetime("expireAt").notNullable();
      // for background process communication
      t.string("status");
      t.string("statusDetails");
      t.uuid("dynamicSecretId").notNullable();
      t.foreign("dynamicSecretId").references("id").inTable(TableName.DynamicSecret).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.DynamicSecretLease);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.DynamicSecretLease);
  await knex.schema.dropTableIfExists(TableName.DynamicSecretLease);

  await dropOnUpdateTrigger(knex, TableName.DynamicSecret);
  await knex.schema.dropTableIfExists(TableName.DynamicSecret);
}
