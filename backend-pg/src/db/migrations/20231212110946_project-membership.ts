import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectRoles))) {
    await knex.schema.createTable(TableName.ProjectRoles, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("description");
      t.string("slug").notNullable();
      t.jsonb("permissions").notNullable();
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }

  if (!(await knex.schema.hasTable(TableName.ProjectMembership))) {
    await knex.schema.createTable(TableName.ProjectMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      // until role is changed/removed the role should not deleted
      t.uuid("roleId");
      t.foreign("roleId").references("id").inTable(TableName.ProjectRoles);
    });
  }
  await createOnUpdateTrigger(knex, TableName.ProjectMembership);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectMembership);
  await knex.schema.dropTableIfExists(TableName.ProjectRoles);
  await dropOnUpdateTrigger(knex, TableName.ProjectMembership);
}
