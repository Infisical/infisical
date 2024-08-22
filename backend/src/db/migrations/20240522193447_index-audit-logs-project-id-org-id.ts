import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
  if (await knex.schema.hasTable(TableName.AuditLog)) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesProjectIdExist) t.index("projectId");
      if (doesOrgIdExist) t.index("orgId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");

  if (await knex.schema.hasTable(TableName.AuditLog)) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesProjectIdExist) t.dropIndex("projectId");
      if (doesOrgIdExist) t.dropIndex("orgId");
    });
  }
}
