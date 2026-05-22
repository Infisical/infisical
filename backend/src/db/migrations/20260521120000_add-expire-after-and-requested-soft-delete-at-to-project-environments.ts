import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  const hasExpireAfter = await knex.schema.hasColumn(TableName.Environment, "expireAfter");
  const hasRequestedSoftDeleteAt = await knex.schema.hasColumn(TableName.Environment, "requestedSoftDeleteAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Environment, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Environment, "deletedByIdentityId");

  if (!hasExpireAfter || !hasRequestedSoftDeleteAt || !hasDeletedByUserId || !hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      if (!hasExpireAfter) t.timestamp("expireAfter", { useTz: true }).nullable();
      if (!hasRequestedSoftDeleteAt) t.timestamp("requestedSoftDeleteAt", { useTz: true }).nullable();
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
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  const hasExpireAfter = await knex.schema.hasColumn(TableName.Environment, "expireAfter");
  const hasRequestedSoftDeleteAt = await knex.schema.hasColumn(TableName.Environment, "requestedSoftDeleteAt");
  const hasDeletedByUserId = await knex.schema.hasColumn(TableName.Environment, "deletedByUserId");
  const hasDeletedByIdentityId = await knex.schema.hasColumn(TableName.Environment, "deletedByIdentityId");

  if (hasExpireAfter || hasRequestedSoftDeleteAt || hasDeletedByUserId || hasDeletedByIdentityId) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      if (hasDeletedByUserId) t.dropColumn("deletedByUserId");
      if (hasDeletedByIdentityId) t.dropColumn("deletedByIdentityId");
      if (hasExpireAfter) t.dropColumn("expireAfter");
      if (hasRequestedSoftDeleteAt) t.dropColumn("requestedSoftDeleteAt");
    });
  }
}
