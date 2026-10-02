import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ResourceGcpAuth))) {
    await knex.schema.createTable(TableName.ResourceGcpAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("authMethodId").notNullable().unique();
      t.foreign("authMethodId").references("id").inTable(TableName.ResourceAuthMethod).onDelete("CASCADE");
      t.string("type", 32).notNullable().defaultTo("gce");
      t.string("allowedServiceAccounts", 1024).notNullable().defaultTo("");
      t.string("allowedProjects", 1024).notNullable().defaultTo("");
      t.string("allowedZones", 1024).notNullable().defaultTo("");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ResourceGcpAuth);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ResourceGcpAuth);
  await knex.schema.dropTableIfExists(TableName.ResourceGcpAuth);
}
