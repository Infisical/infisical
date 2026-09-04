import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasExternalApprovalPolicyTable = await knex.schema.hasTable(TableName.ExternalApprovalPolicy);
  if (!hasExternalApprovalPolicyTable) {
    await knex.schema.createTable(TableName.ExternalApprovalPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("type").notNullable();

      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.index("connectionId", "external_approval_policies_connection_id_index");

      t.uuid("approverIdentityId").nullable();
      t.foreign("approverIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      t.index("approverIdentityId", "external_approval_policies_approver_identity_id_index", {
        predicate: knex.whereNotNull("approverIdentityId")
      });

      t.timestamps(true, true, true);
    });
  }

  const hasExternalApprovalRequestTable = await knex.schema.hasTable(TableName.ExternalApprovalRequest);
  if (!hasExternalApprovalRequestTable) {
    await knex.schema.createTable(TableName.ExternalApprovalRequest, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("externalId", 255).nullable();
      t.string("status", 50).nullable();
      t.timestamp("approvedAt").nullable();

      t.uuid("approvedByIdentityId").nullable();
      t.foreign("approvedByIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      t.index("approvedByIdentityId", "external_approval_requests_approved_by_identity_id_index", {
        predicate: knex.whereNotNull("approvedByIdentityId")
      });

      t.timestamps(true, true, true);
    });
  }

  const hasExternalApprovalPolicyIdColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "externalApprovalPolicyId"
  );
  if (!hasExternalApprovalPolicyIdColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.uuid("externalApprovalPolicyId").nullable().unique();
      t.foreign("externalApprovalPolicyId")
        .references("id")
        .inTable(TableName.ExternalApprovalPolicy)
        .onDelete("SET NULL");
    });
  }

  const hasExternalApprovalRequestIdColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "externalApprovalRequestId"
  );
  if (!hasExternalApprovalRequestIdColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.uuid("externalApprovalRequestId").nullable().unique();
      t.foreign("externalApprovalRequestId")
        .references("id")
        .inTable(TableName.ExternalApprovalRequest)
        .onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasExternalApprovalPolicyIdColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "externalApprovalPolicyId"
  );
  if (hasExternalApprovalPolicyIdColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropColumn("externalApprovalPolicyId");
    });
  }

  const hasExternalApprovalRequestIdColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "externalApprovalRequestId"
  );
  if (hasExternalApprovalRequestIdColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropColumn("externalApprovalRequestId");
    });
  }

  const hasExternalApprovalRequestTable = await knex.schema.hasTable(TableName.ExternalApprovalRequest);
  if (hasExternalApprovalRequestTable) {
    await knex.schema.dropTable(TableName.ExternalApprovalRequest);
  }

  const hasExternalApprovalPolicyTable = await knex.schema.hasTable(TableName.ExternalApprovalPolicy);
  if (hasExternalApprovalPolicyTable) {
    await knex.schema.dropTable(TableName.ExternalApprovalPolicy);
  }
}
