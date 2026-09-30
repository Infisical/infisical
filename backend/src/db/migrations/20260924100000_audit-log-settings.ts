import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AuditLogSettings))) {
    await knex.schema.createTable(TableName.AuditLogSettings, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("projectId").nullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("eventClass").notNullable();
      t.boolean("isEnabled").notNullable().defaultTo(true);
      t.timestamps(true, true, true);
      t.index(["orgId"]);
    });

    await knex.raw(
      `CREATE UNIQUE INDEX "audit_log_settings_org_scope_unique" ON ??("orgId", "eventClass") WHERE "projectId" IS NULL`,
      [TableName.AuditLogSettings]
    );
    await knex.raw(
      `CREATE UNIQUE INDEX "audit_log_settings_project_scope_unique" ON ??("projectId", "eventClass") WHERE "projectId" IS NOT NULL`,
      [TableName.AuditLogSettings]
    );

    await createOnUpdateTrigger(knex, TableName.AuditLogSettings);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AuditLogSettings);
  await knex.schema.dropTableIfExists(TableName.AuditLogSettings);
}
