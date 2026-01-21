import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectTemplateUserMembership))) {
    await knex.schema.createTable(TableName.ProjectTemplateUserMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("projectTemplateId").notNullable();
      t.foreign("projectTemplateId").references("id").inTable(TableName.ProjectTemplates).onDelete("CASCADE");
      t.uuid("membershipId").notNullable();
      t.foreign("membershipId").references("id").inTable(TableName.Membership).onDelete("CASCADE");
      t.specificType("roles", "text[]").notNullable();
      t.timestamps(true, true, true);
      t.unique(["projectTemplateId", "membershipId"]);
    });
    await createOnUpdateTrigger(knex, TableName.ProjectTemplateUserMembership);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectTemplateUserMembership);
  await dropOnUpdateTrigger(knex, TableName.ProjectTemplateUserMembership);
}
