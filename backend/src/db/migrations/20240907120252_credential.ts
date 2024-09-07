import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CredentialWebLogin))) {
    await knex.schema.createTable(TableName.CredentialWebLogin, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.string("website").notNullable();
      t.string("username").notNullable();
      t.string("encryptedPassword").notNullable();
      t.string("encryptedPasswordIV").notNullable();
      t.string("encryptedPasswordTag").notNullable();
    });
  }
  await createOnUpdateTrigger(knex, TableName.CredentialWebLogin);

  if (!(await knex.schema.hasTable(TableName.CredentialSecureNote))) {
    await knex.schema.createTable(TableName.CredentialSecureNote, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.text("encryptedNote").notNullable();
      t.text("encryptedNoteIV").notNullable();
      t.text("encryptedNoteTag").notNullable();
    });
  }
  await createOnUpdateTrigger(knex, TableName.CredentialSecureNote);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CredentialSecureNote);
  await dropOnUpdateTrigger(knex, TableName.CredentialSecureNote);

  await knex.schema.dropTableIfExists(TableName.CredentialWebLogin);
  await dropOnUpdateTrigger(knex, TableName.CredentialWebLogin);
}
