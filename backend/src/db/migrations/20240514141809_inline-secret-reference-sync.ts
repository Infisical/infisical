import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretReference))) {
    await knex.schema.createTable(TableName.SecretReference, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("environment").notNullable();
      t.string("secretPath").notNullable();
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.Secret).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SecretReference);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretReference);
  await dropOnUpdateTrigger(knex, TableName.SecretReference);
}
