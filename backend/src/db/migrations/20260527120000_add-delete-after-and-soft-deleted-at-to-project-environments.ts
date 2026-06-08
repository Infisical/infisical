import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hashtable = await knex.schema.hashtable(TableName.Environment);
  if (!hashtable) return;

  const hasDeleteAfter = await knex.schema.hasColumn(TableName.Environment, "deleteAfter");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Environment, "softDeletedAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Environment, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Environment, "deletedByIdentityId");

  if (!hasDeleteAfter || !hasSoftDeletedAt || !hasDeletedByUserId || !hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
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
  const hashtable = await knex.schema.hashtable(TableName.Environment);
  if (!hashtable) return;

  const hasDeleteAfter = await knex.schema.hasColumn(TableName.Environment, "deleteAfter");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Environment, "softDeletedAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Environment, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Environment, "deletedByIdentityId");

  if (hasDeleteAfter || hasSoftDeletedAt || hasDeletedByUserId || hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      if (hasDeletedByUserId) t.dropColumn("deletedByUserId");
      if (hasDeletedByIdentityId) t.dropColumn("deletedByIdentityId");
      if (hasDeleteAfter) t.dropColumn("deleteAfter");
      if (hasSoftDeletedAt) t.dropColumn("softDeletedAt");
    });
  }
}
