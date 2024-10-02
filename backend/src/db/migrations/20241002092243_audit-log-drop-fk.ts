import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesTableExist = await knex.schema.hasTable(TableName.AuditLog);

  const doesProjectNameExist = await knex.schema.hasColumn(TableName.AuditLog, "projectName");

  if (doesTableExist) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      // remove existing FKs
      if (doesOrgIdExist) {
        t.dropForeign("orgId");
      }

      if (doesProjectIdExist) {
        t.dropForeign("projectId");
      }

      // add normalized fields necessary after FK removal
      if (!doesProjectNameExist) {
        t.string("projectName");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesTableExist = await knex.schema.hasTable(TableName.AuditLog);
  const doesProjectNameExist = await knex.schema.hasColumn(TableName.AuditLog, "projectName");

  if (doesTableExist) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      // add back FKs
      if (doesOrgIdExist) {
        t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      }
      if (doesProjectIdExist) {
        t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      }

      // remove normalized fields
      if (doesProjectNameExist) {
        t.dropColumn("projectName");
      }
    });
  }
}
