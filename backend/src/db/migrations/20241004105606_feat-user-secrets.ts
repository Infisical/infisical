import { Knex } from "knex";

import { TableName } from "../schemas";

enum CredentialTypes {
  WebLogin = "web_login",
  CreditCard = "credit_card",
  SecureNote = "secure_note"
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecrets))) {
    await knex.schema.createTable(TableName.UserSecrets, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.dateTime("createdAt").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable(TableName.UserSecretCredentials))) {
    await knex.schema.createTable(TableName.UserSecretCredentials, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("credentialId").notNullable();
      t.foreign("credentialId").references("id").inTable(TableName.UserSecrets).onDelete("CASCADE");
      t.enum("credentialType", Object.values(CredentialTypes)).notNullable();
      t.string("name").notNullable();
      t.text("data").notNullable();
      t.dateTime("createdAt").defaultTo(knex.fn.now());
      t.dateTime("updatedAt").defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecrets);
  await knex.schema.dropTableIfExists(TableName.UserSecretCredentials);
}
