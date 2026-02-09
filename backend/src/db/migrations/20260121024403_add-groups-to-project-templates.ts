import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectTemplateGroupMembership))) {
    await knex.schema.createTable(TableName.ProjectTemplateGroupMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("projectTemplateId").notNullable();
      t.foreign("projectTemplateId").references("id").inTable(TableName.ProjectTemplates).onDelete("CASCADE");
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.specificType("roles", "text[]").notNullable();
      t.timestamps(true, true, true);
      t.unique(["projectTemplateId", "groupId"]);
    });
    await createOnUpdateTrigger(knex, TableName.ProjectTemplateGroupMembership);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectTemplateGroupMembership);
  await dropOnUpdateTrigger(knex, TableName.ProjectTemplateGroupMembership);
}
