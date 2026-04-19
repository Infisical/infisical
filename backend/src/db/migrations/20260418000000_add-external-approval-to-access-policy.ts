import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Add external approval columns to access_approval_policies
  const hasPolicyExternalType = await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "externalApprovalType");

  if (!hasPolicyExternalType) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.string("externalApprovalType", 50).nullable();
      t.uuid("appConnectionId").nullable();
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");
    });
  }

  // Add external tracking columns to access_approval_requests
  const hasRequestExternalId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "externalRequestId");

  if (!hasRequestExternalId) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.string("externalRequestId", 255).nullable();
      t.string("externalStatus", 50).nullable();
      t.timestamp("externalApprovedAt").nullable();
      t.uuid("externalApprovedByIdentityId").nullable();
      t.foreign("externalApprovedByIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      t.jsonb("externalMetadata").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove columns from access_approval_requests
  const hasRequestExternalId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "externalRequestId");

  if (hasRequestExternalId) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropForeign(["externalApprovedByIdentityId"]);
      t.dropColumn("externalRequestId");
      t.dropColumn("externalStatus");
      t.dropColumn("externalApprovedAt");
      t.dropColumn("externalApprovedByIdentityId");
      t.dropColumn("externalMetadata");
    });
  }

  // Remove columns from access_approval_policies
  const hasPolicyExternalType = await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "externalApprovalType");

  if (hasPolicyExternalType) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropForeign(["appConnectionId"]);
      t.dropColumn("externalApprovalType");
      t.dropColumn("appConnectionId");
    });
  }
}
