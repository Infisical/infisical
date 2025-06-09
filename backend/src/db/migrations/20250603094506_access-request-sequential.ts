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
      if (!hasStepColumn) t.integer("sequence").defaultTo(0);
      if (!hasApprovalRequiredColumn) t.integer("approvalsRequired").nullable();
    });
  }
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
