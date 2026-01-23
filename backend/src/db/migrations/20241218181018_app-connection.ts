import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AppConnection))) {
    await knex.schema.createTable(TableName.AppConnection, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description");
      t.string("app").notNullable();
      t.string("method").notNullable();
      t.binary("encryptedCredentials").notNullable();
      t.integer("version").defaultTo(1).notNullable();
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AppConnection);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AppConnection);
  await dropOnUpdateTrigger(knex, TableName.AppConnection);
}
