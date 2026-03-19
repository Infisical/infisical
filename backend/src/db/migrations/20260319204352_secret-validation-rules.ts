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
      tb.uuid("envId").nullable();
      tb.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      tb.string("secretPath").notNullable().defaultTo("/");
      tb.string("type").notNullable();
      tb.jsonb("inputs").notNullable();
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
