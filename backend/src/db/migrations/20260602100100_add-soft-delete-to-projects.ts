import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasDeleteAfter = await knex.schema.hasColumn(TableName.Project, "deleteAfter");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Project, "softDeletedAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Project, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Project, "deletedByIdentityId");

  if (!hasDeleteAfter || !hasSoftDeletedAt || !hasDeletedByUserId || !hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      if (!hasDeleteAfter) t.timestamp("deleteAfter", { useTz: true }).nullable();
      if (!hasSoftDeletedAt) t.timestamp("softDeletedAt", { useTz: true }).nullable();
      if (!hasDeletedByUserId) {
        t.uuid("deletedByUserId").nullable();
        t.foreign("deletedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      }
      if (!hasDeletedByIdentityId) {
        t.uuid("deletedByIdentityId").nullable();
        t.foreign("deletedByIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasDeleteAfter = await knex.schema.hasColumn(TableName.Project, "deleteAfter");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Project, "softDeletedAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Project, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Project, "deletedByIdentityId");

  if (hasDeleteAfter || hasSoftDeletedAt || hasDeletedByUserId || hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      if (hasDeletedByUserId) t.dropColumn("deletedByUserId");
      if (hasDeletedByIdentityId) t.dropColumn("deletedByIdentityId");
      if (hasDeleteAfter) t.dropColumn("deleteAfter");
      if (hasSoftDeletedAt) t.dropColumn("softDeletedAt");
    });
  }
}
