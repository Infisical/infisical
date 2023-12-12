import { Knex } from "knex";
import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Project))) {
    await knex.schema.createTable(TableName.Project, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.boolean("autoCapitalization").defaultTo(true);
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.Project);
  if (!(await knex.schema.hasTable(TableName.Environment))) {
    await knex.schema.createTable(TableName.Environment, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("slug").notNullable();
      t.uuid("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Environment);
  await knex.schema.dropTableIfExists(TableName.Project);
  await dropOnUpdateTrigger(knex, TableName.Project);
}
