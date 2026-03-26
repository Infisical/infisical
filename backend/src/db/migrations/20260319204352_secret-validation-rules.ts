import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretValidationRule))) {
    await knex.schema.createTable(TableName.SecretValidationRule, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("name").notNullable();
      tb.string("description").nullable();
      tb.string("projectId").notNullable();
      tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      // null = not scoped to a specific env
      tb.uuid("envId").nullable();
      tb.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");

      // we store it as a string because it's a glob pattern that we need to evaluate against at a later stage, not a specific folder
      tb.string("secretPath").notNullable();
      tb.string("type").notNullable();
      tb.binary("encryptedInputs").notNullable();
      tb.boolean("isActive").notNullable().defaultTo(true);

      tb.index("projectId");
      tb.index("envId");
      tb.index("secretPath");

      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SecretValidationRule);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.SecretValidationRule);
  await knex.schema.dropTableIfExists(TableName.SecretValidationRule);
}
