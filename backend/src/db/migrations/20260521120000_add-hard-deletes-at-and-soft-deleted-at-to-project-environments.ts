import { Knex } from "knex";

import { TableName } from "../schemas";

const DELETED_ENVIRONMENTS_INDEX = "idx_project_environments_soft_deleted_project_position";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  const hasHardDeletesAt = await knex.schema.hasColumn(TableName.Environment, "hardDeletesAt");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Environment, "softDeletedAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Environment, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Environment, "deletedByIdentityId");

  if (!hasHardDeletesAt || !hasSoftDeletedAt || !hasDeletedByUserId || !hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      if (!hasHardDeletesAt) t.timestamp("hardDeletesAt", { useTz: true }).nullable();
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

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS "${DELETED_ENVIRONMENTS_INDEX}"
      ON ${TableName.Environment} ("projectId", "position")
      WHERE "softDeletedAt" IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  await knex.raw(`DROP INDEX IF EXISTS "${DELETED_ENVIRONMENTS_INDEX}"`);

  const hasHardDeletesAt = await knex.schema.hasColumn(TableName.Environment, "hardDeletesAt");
  const hasSoftDeletedAt = await knex.schema.hasColumn(TableName.Environment, "softDeletedAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Environment, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Environment, "deletedByIdentityId");

  if (hasHardDeletesAt || hasSoftDeletedAt || hasDeletedByUserId || hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      if (hasDeletedByUserId) t.dropColumn("deletedByUserId");
      if (hasDeletedByIdentityId) t.dropColumn("deletedByIdentityId");
      if (hasHardDeletesAt) t.dropColumn("hardDeletesAt");
      if (hasSoftDeletedAt) t.dropColumn("softDeletedAt");
    });
  }
}
