import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityLdapAuth))) {
    await knex.schema.createTable(TableName.IdentityLdapAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.bigInteger("accessTokenTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenMaxTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenNumUsesLimit").defaultTo(0).notNullable();
      t.jsonb("accessTokenTrustedIps").notNullable();

      t.uuid("identityId").notNullable().unique();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.binary("encryptedBindDN").notNullable();
      t.binary("encryptedBindPass").notNullable();
      t.binary("encryptedLdapCaCertificate").nullable();

      t.string("url").notNullable();
      t.string("searchBase").notNullable();
      t.string("searchFilter").notNullable();

      t.jsonb("allowedFields").nullable();

      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityLdapAuth);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityLdapAuth);
  await dropOnUpdateTrigger(knex, TableName.IdentityLdapAuth);
}
