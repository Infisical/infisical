import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AuditLog)) {
    const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
    const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
    const doesProjectNameExist = await knex.schema.hasColumn(TableName.AuditLog, "projectName");

    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesOrgIdExist) {
        t.dropForeign("orgId");
      }

      if (doesProjectIdExist) {
        t.dropForeign("projectId");
      }

      // add normalized field
      if (!doesProjectNameExist) {
        t.string("projectName");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesProjectNameExist = await knex.schema.hasColumn(TableName.AuditLog, "projectName");

  if (await knex.schema.hasTable(TableName.AuditLog)) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesOrgIdExist) {
        t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      }
      if (doesProjectIdExist) {
        t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      }

      // remove normalized field
      if (doesProjectNameExist) {
        t.dropColumn("projectName");
      }
    });
  }
}
