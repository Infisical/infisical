import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectTemplateIdentityMembership))) {
    await knex.schema.createTable(TableName.ProjectTemplateIdentityMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("projectTemplateId").notNullable();
      t.foreign("projectTemplateId").references("id").inTable(TableName.ProjectTemplates).onDelete("CASCADE");
      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.specificType("roles", "text[]").notNullable();
      t.timestamps(true, true, true);
      t.unique(["projectTemplateId", "identityId"]);
    });
    await createOnUpdateTrigger(knex, TableName.ProjectTemplateIdentityMembership);
  }

  const hasCol = await knex.schema.hasColumn(TableName.ProjectTemplates, "projectManagedIdentities");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      t.jsonb("projectManagedIdentities").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectTemplateIdentityMembership);
  await dropOnUpdateTrigger(knex, TableName.ProjectTemplateIdentityMembership);

  const hasCol = await knex.schema.hasColumn(TableName.ProjectTemplates, "projectManagedIdentities");
  if (hasCol) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      t.dropColumn("projectManagedIdentities");
    });
  }
}
