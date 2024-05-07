import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
  const doesCreatedAtExist = await knex.schema.hasColumn(TableName.AuditLog, "createdAt");
  if (await knex.schema.hasTable(TableName.AuditLog)) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesProjectIdExist && doesCreatedAtExist) t.index(["projectId", "createdAt"]);
      if (doesOrgIdExist && doesCreatedAtExist) t.index(["orgId", "createdAt"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
  const doesCreatedAtExist = await knex.schema.hasColumn(TableName.AuditLog, "createdAt");

  if (await knex.schema.hasTable(TableName.AuditLog)) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesProjectIdExist && doesCreatedAtExist) t.dropIndex(["projectId", "createdAt"]);
      if (doesOrgIdExist && doesCreatedAtExist) t.dropIndex(["orgId", "createdAt"]);
    });
  }
}
