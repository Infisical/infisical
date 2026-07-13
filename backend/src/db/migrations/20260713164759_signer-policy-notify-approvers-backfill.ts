import { Knex } from "knex";

import { TableName } from "../schemas";

// Signer policies never exposed a notify-approvers toggle, so their steps were created with the
// column default (false) and approvers were never notified. New signer policy steps are now
// created with notifyApprovers=true; this backfills existing signer policy steps and the steps
// of still-pending signer requests.
export async function up(knex: Knex): Promise<void> {
  await knex(TableName.ApprovalPolicySteps)
    .whereIn("policyId", knex(TableName.ApprovalPolicies).select("id").where("scopeType", "pki-signer"))
    .update({ notifyApprovers: true });

  await knex(TableName.ApprovalRequestSteps)
    .whereIn(
      "requestId",
      knex(TableName.ApprovalRequests)
        .select("id")
        .where("status", "pending")
        .whereIn("policyId", knex(TableName.ApprovalPolicies).select("id").where("scopeType", "pki-signer"))
    )
    .update({ notifyApprovers: true });
}

export async function down(): Promise<void> {
  // No rollback: the previous false values were an unintended default, not user configuration.
}
