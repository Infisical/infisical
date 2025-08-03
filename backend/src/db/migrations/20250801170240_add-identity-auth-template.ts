import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityAuthTemplate))) {
    await knex.schema.createTable(TableName.IdentityAuthTemplate, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.binary("templateFields").notNullable();
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("name", 64).notNullable();
      t.string("authMethod").notNullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.IdentityAuthTemplate);
  }
  if (!(await knex.schema.hasColumn(TableName.IdentityLdapAuth, "templateId"))) {
    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      t.uuid("templateId").nullable();
      t.foreign("templateId").references("id").inTable(TableName.IdentityAuthTemplate).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.IdentityLdapAuth, "template")) {
    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      t.dropForeign("templateId");
      t.dropColumn("templateId");
    });
  }
  await knex.schema.dropTableIfExists(TableName.IdentityAuthTemplate);
  await dropOnUpdateTrigger(knex, TableName.IdentityAuthTemplate);
}
