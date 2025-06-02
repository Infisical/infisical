import { Knex } from "knex";

import { ApprovalStatus } from "@app/ee/services/secret-approval-request/secret-approval-request-types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasPrivilegeDeletedAtColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "privilegeDeletedAt"
  );
  const hasStatusColumn = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "status");

  if (!hasPrivilegeDeletedAtColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.timestamp("privilegeDeletedAt").nullable();
    });
  }

  if (!hasStatusColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.string("status").defaultTo(ApprovalStatus.PENDING).notNullable();
    });

    // Update existing rows based on business logic
    // If privilegeId is not null, set status to "approved"
    await knex(TableName.AccessApprovalRequest).whereNotNull("privilegeId").update({ status: ApprovalStatus.APPROVED });

    // If privilegeId is null and there's a rejected reviewer, set to "rejected"
    const rejectedRequestIds = await knex(TableName.AccessApprovalRequestReviewer)
      .select("requestId")
      .where("status", "rejected")
      .distinct()
      .pluck("requestId");

    if (rejectedRequestIds.length > 0) {
      await knex(TableName.AccessApprovalRequest)
        .whereNull("privilegeId")
        .whereIn("id", rejectedRequestIds)
        .update({ status: ApprovalStatus.REJECTED });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPrivilegeDeletedAtColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "privilegeDeletedAt"
  );
  const hasStatusColumn = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "status");

  if (hasPrivilegeDeletedAtColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropColumn("privilegeDeletedAt");
    });
  }

  if (hasStatusColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropColumn("status");
    });
  }
}
