import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.LdapConfig))) {
    await knex.schema.createTable(TableName.LdapConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.boolean("isActive").notNullable();
      t.string("url").notNullable();
      t.string("encryptedBindDN").notNullable();
      t.string("bindDNIV").notNullable();
      t.string("bindDNTag").notNullable();
      t.string("encryptedBindPass").notNullable();
      t.string("bindPassIV").notNullable();
      t.string("bindPassTag").notNullable();
      t.string("searchBase").notNullable();
      t.text("encryptedCACert").notNullable();
      t.string("caCertIV").notNullable();
      t.string("caCertTag").notNullable();
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.LdapConfig);

  if (!(await knex.schema.hasTable(TableName.UserAliases))) {
    await knex.schema.createTable(TableName.UserAliases, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.string("username").notNullable();
      t.string("aliasType").notNullable();
      t.string("externalId").notNullable();
      t.specificType("emails", "text[]");
      t.uuid("orgId").nullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.UserAliases);

  await knex.schema.alterTable(TableName.Users, (t) => {
    t.string("username").unique();
    t.string("email").nullable().alter();
    t.dropUnique(["email"]);
  });

  await knex(TableName.Users).update("username", knex.ref("email"));

  await knex.schema.alterTable(TableName.Users, (t) => {
    t.string("username").notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.LdapConfig);
  await knex.schema.dropTableIfExists(TableName.UserAliases);
  await knex.schema.alterTable(TableName.Users, (t) => {
    t.dropColumn("username");
    // t.string("email").notNullable().alter();
  });
  await dropOnUpdateTrigger(knex, TableName.LdapConfig);
}
