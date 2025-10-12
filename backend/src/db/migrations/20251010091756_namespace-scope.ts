import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Identity)) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.uuid("scopeNamespaceId");
      t.foreign("scopeNamespaceId").references("id").inTable(TableName.Namespace).onDelete("CASCADE");
      t.string("scopeProjectId");
      t.foreign("scopeProjectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }

  if (await knex.schema.hasTable(TableName.Project)) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.uuid("namespaceId");
      t.foreign("namespaceId").references("id").inTable(TableName.Namespace).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Identity)) {
    const hasNamespaceId = await knex.schema.hasColumn(TableName.Identity, "namespaceId");
    const hasProjectId = await knex.schema.hasColumn(TableName.Identity, "projectId");
    await knex.schema.alterTable(TableName.Identity, (t) => {
      if (hasNamespaceId) t.dropColumn("scopeNamespaceId");
      if (hasProjectId) t.dropColumn("scopeProjectId");
    });
  }

  const hasProjectNamespaceCol = await knex.schema.hasColumn(TableName.Project, "namespaceId");
  if (hasProjectNamespaceCol) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("namespaceId");
    });
  }
}
