import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  const hasApprovedAt = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "approvedAt");
  const hasRevokedAt = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "revokedAt");
  const hasApprovedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "approvedByUserId");
  const hasRevokedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "revokedByUserId");

  if (!hasApprovedAt || !hasRevokedAt || !hasApprovedByUserId || !hasRevokedByUserId) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      if (!hasApprovedAt) {
        t.timestamp("approvedAt", { useTz: true }).nullable();
      }
      if (!hasRevokedAt) {
        t.timestamp("revokedAt", { useTz: true }).nullable();
      }
      if (!hasApprovedByUserId) {
        t.uuid("approvedByUserId").nullable();
        t.foreign("approvedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      }
      if (!hasRevokedByUserId) {
        t.uuid("revokedByUserId").nullable();
        t.foreign("revokedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasApprovedAt = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "approvedAt");
  const hasRevokedAt = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "revokedAt");
  const hasApprovedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "approvedByUserId");
  const hasRevokedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "revokedByUserId");

  if (hasApprovedAt || hasRevokedAt || hasApprovedByUserId || hasRevokedByUserId) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      if (hasRevokedByUserId) {
        t.dropColumn("revokedByUserId");
      }
      if (hasApprovedByUserId) {
        t.dropColumn("approvedByUserId");
      }
      if (hasRevokedAt) {
        t.dropColumn("revokedAt");
      }
      if (hasApprovedAt) {
        t.dropColumn("approvedAt");
      }
    });
  }
}
