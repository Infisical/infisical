import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.LdapConfig))) {
    await knex.schema.createTable(TableName.LdapConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization);
      t.boolean("isActive").notNullable();
      t.string("url").notNullable();
      t.string("encryptedBindDN");
      t.string("bindDNIV");
      t.string("bindDNTag");
      t.string("encryptedBindPass");
      t.string("bindPassIV");
      t.string("bindPassTag");
      t.text("searchBase").notNullable();
      t.string("encryptedCACert");
      t.string("caCertIV");
      t.string("caCertTag");
      t.timestamps(true, true, true);
    });
  }

  await knex.schema.alterTable(TableName.Users, (t) => {
    t.string("username");
    t.uuid("orgId");
    t.string("email").nullable().alter();
  });

  await knex(TableName.Users).update("username", knex.ref("email"));

  await createOnUpdateTrigger(knex, TableName.LdapConfig);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.LdapConfig);
  await knex.schema.alterTable(TableName.Users, (t) => {
    t.dropColumn("username");
    t.dropColumn("orgId");
    t.string("email").notNullable().alter();
  });
  await dropOnUpdateTrigger(knex, TableName.LdapConfig);
}
