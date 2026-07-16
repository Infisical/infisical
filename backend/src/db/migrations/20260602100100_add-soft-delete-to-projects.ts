import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasDeleteAfter = await knex.schema.hasColumn(TableName.Project, "deleteAfter");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Project, "softDeletedAt");
  const hasDeletedByActorType = await knex.schema.hasColumn(TableName.Project, "deletedByActorType");
  const hasDeletedByActorId = await knex.schema.hasColumn(TableName.Project, "deletedByActorId");

  if (!hasDeleteAfter || !hasSoftDeletedAt || !hasDeletedByActorType || !hasDeletedByActorId) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      if (!hasDeleteAfter) t.timestamp("deleteAfter", { useTz: true }).nullable();
      if (!hasSoftDeletedAt) t.timestamp("softDeletedAt", { useTz: true }).nullable();
      if (!hasDeletedByActorType) t.string("deletedByActorType").nullable();
      if (!hasDeletedByActorId) t.uuid("deletedByActorId").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasDeleteAfter = await knex.schema.hasColumn(TableName.Project, "deleteAfter");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Project, "softDeletedAt");
  const hasDeletedByActorType = await knex.schema.hasColumn(TableName.Project, "deletedByActorType");
  const hasDeletedByActorId = await knex.schema.hasColumn(TableName.Project, "deletedByActorId");

  if (hasDeleteAfter || hasSoftDeletedAt || hasDeletedByActorType || hasDeletedByActorId) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      if (hasDeletedByActorType) t.dropColumn("deletedByActorType");
      if (hasDeletedByActorId) t.dropColumn("deletedByActorId");
      if (hasDeleteAfter) t.dropColumn("deleteAfter");
      if (hasSoftDeletedAt) t.dropColumn("softDeletedAt");
    });
  }
}
