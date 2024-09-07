import type { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Credential))) {
    await knex.schema.createTable(TableName.Credential, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("type").notNullable();

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.dateTime("createdAt").notNullable();
      t.dateTime("updatedAt").notNullable();
    });
  }
  await createOnUpdateTrigger(knex, TableName.Credential);

  if (!(await knex.schema.hasTable(TableName.CredentialWebLogin))) {
    await knex.schema.createTable(TableName.CredentialWebLogin, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("url").notNullable();
      t.string("username").notNullable();
      t.string("encryptedPassword").notNullable();

      // one-to-one relationship
      t.uuid("credentialId").notNullable();
      t.foreign("credentialId").references("id").inTable(TableName.Credential).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.CredentialWebLogin);

  if (!(await knex.schema.hasTable(TableName.CredentialSecureNote))) {
    await knex.schema.createTable(TableName.CredentialSecureNote, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.text("content").notNullable();

      // one-to-one relationship
      t.uuid("credentialId").notNullable();
      t.foreign("credentialId").references("id").inTable(TableName.Credential).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.CredentialSecureNote);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Credential);
  await dropOnUpdateTrigger(knex, TableName.Credential);

  await knex.schema.dropTableIfExists(TableName.CredentialSecureNote);
  await dropOnUpdateTrigger(knex, TableName.CredentialSecureNote);

  await knex.schema.dropTableIfExists(TableName.CredentialWebLogin);
  await dropOnUpdateTrigger(knex, TableName.CredentialWebLogin);
}
