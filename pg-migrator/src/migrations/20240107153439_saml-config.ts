import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SamlConfig))) {
    await knex.schema.createTable(TableName.SamlConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("authProvider").notNullable();
      t.boolean("isActive").notNullable();
      t.string("encryptedEntryPoint");
      t.string("entryPointIV");
      t.string("entryPointTag");
      t.string("encryptedIssuer");
      t.string("issuerTag");
      t.string("issuerIV");
      t.text("encryptedCert");
      t.string("certIV");
      t.string("certTag");
      t.timestamps(true, true, true);
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization);
    });
  }

  await createOnUpdateTrigger(knex, TableName.SamlConfig);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SamlConfig);
  await dropOnUpdateTrigger(knex, TableName.SamlConfig);
}
