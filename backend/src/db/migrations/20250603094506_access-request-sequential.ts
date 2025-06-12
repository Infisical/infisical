import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasStepColumn = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "sequence");
  const hasApprovalRequiredColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicyApprover,
    "approvalsRequired"
  );
  if (!hasStepColumn || !hasApprovalRequiredColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (t) => {
      if (!hasStepColumn) t.integer("sequence").defaultTo(1);
      if (!hasApprovalRequiredColumn) t.integer("approvalsRequired").nullable();
    });
  }

  // set rejected status for all access request that was rejected and still has status pending
  const subquery = knex(TableName.AccessApprovalRequest)
    .leftJoin(
      TableName.AccessApprovalRequestReviewer,
      `${TableName.AccessApprovalRequestReviewer}.requestId`,
      `${TableName.AccessApprovalRequest}.id`
    )
    .where(`${TableName.AccessApprovalRequest}.status` as "status", "pending")
    .where(`${TableName.AccessApprovalRequestReviewer}.status` as "status", "rejected")
    .select(`${TableName.AccessApprovalRequest}.id`);

  await knex(TableName.AccessApprovalRequest).where("id", "in", subquery).update("status", "rejected");
}

export async function down(knex: Knex): Promise<void> {
  const hasStepColumn = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "sequence");
  const hasApprovalRequiredColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicyApprover,
    "approvalsRequired"
  );
  if (hasStepColumn || hasApprovalRequiredColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (t) => {
      if (hasStepColumn) t.dropColumn("sequence");
      if (hasApprovalRequiredColumn) t.dropColumn("approvalsRequired");
    });
  }
}
