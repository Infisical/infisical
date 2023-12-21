import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretTag))) {
    await knex.schema.createTable(TableName.SecretTag, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("slug").notNullable();
      t.string("tagColor").notNullable();
      t.timestamps(true, true, true);
      t.uuid("createdBy").notNullable();
      t.foreign("createdBy").references("id").inTable(TableName.Users).onDelete("NO ACTION");
      t.uuid("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretTag);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretTag);
  await dropOnUpdateTrigger(knex, TableName.SecretTag);
}
