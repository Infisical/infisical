import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasApprovalRequestIdCol = await knex.schema.hasColumn(TableName.CertificateRequests, "approvalRequestId");

  if (!hasApprovalRequestIdCol) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.uuid("approvalRequestId").nullable();
      t.foreign("approvalRequestId").references("id").inTable(TableName.ApprovalRequests).onDelete("SET NULL");

      t.string("ttl").nullable();
      t.string("issuanceType").nullable();
      t.string("enrollmentType").nullable();
      t.jsonb("altNamesJson").nullable();

      t.string("organization").nullable();
      t.string("organizationalUnit").nullable();
      t.string("country").nullable();
      t.string("state").nullable();
      t.string("locality").nullable();

      t.index("approvalRequestId");
    });
  }

  const hasMachineIdentityIdCol = await knex.schema.hasColumn(TableName.ApprovalRequests, "machineIdentityId");
  if (!hasMachineIdentityIdCol) {
    await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
      t.uuid("machineIdentityId").nullable().index();
      t.foreign("machineIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
    });
  }

  const hasBypassCol = await knex.schema.hasColumn(TableName.ApprovalPolicies, "bypassForMachineIdentities");
  if (!hasBypassCol) {
    await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
      t.boolean("bypassForMachineIdentities").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasApprovalRequestIdCol = await knex.schema.hasColumn(TableName.CertificateRequests, "approvalRequestId");

  if (hasApprovalRequestIdCol) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropIndex("approvalRequestId");
      t.dropForeign(["approvalRequestId"]);
      t.dropColumn("approvalRequestId");
      t.dropColumn("ttl");
      t.dropColumn("issuanceType");
      t.dropColumn("enrollmentType");
      t.dropColumn("altNamesJson");
      t.dropColumn("organization");
      t.dropColumn("organizationalUnit");
      t.dropColumn("country");
      t.dropColumn("state");
      t.dropColumn("locality");
    });
  }

  const hasBypassCol = await knex.schema.hasColumn(TableName.ApprovalPolicies, "bypassForMachineIdentities");
  if (hasBypassCol) {
    await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
      t.dropColumn("bypassForMachineIdentities");
    });
  }

  const hasMachineIdentityIdCol = await knex.schema.hasColumn(TableName.ApprovalRequests, "machineIdentityId");
  if (hasMachineIdentityIdCol) {
    await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
      t.dropIndex("machineIdentityId");
      t.dropForeign(["machineIdentityId"]);
      t.dropColumn("machineIdentityId");
    });
  }
}
