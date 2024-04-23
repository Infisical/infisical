import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.LdapGroupMap))) {
    await knex.schema.createTable(TableName.LdapGroupMap, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("ldapConfigId").notNullable();
      t.foreign("ldapConfigId").references("id").inTable(TableName.LdapConfig).onDelete("CASCADE");
      t.string("ldapGroupCN").notNullable();
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.unique(["ldapGroupCN", "groupId", "ldapConfigId"]);
    });
  }

  await createOnUpdateTrigger(knex, TableName.LdapGroupMap);

  await knex.schema.alterTable(TableName.LdapConfig, (t) => {
    t.string("groupSearchBase").notNullable().defaultTo("");
    t.string("groupSearchFilter").notNullable().defaultTo("");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.LdapGroupMap);
  await dropOnUpdateTrigger(knex, TableName.LdapGroupMap);
  await knex.schema.alterTable(TableName.LdapConfig, (t) => {
    t.dropColumn("groupSearchBase");
    t.dropColumn("groupSearchFilter");
  });
}
