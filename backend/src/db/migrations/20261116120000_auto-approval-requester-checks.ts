import { Knex } from "knex";

import { TableName } from "../schemas";

const CONDITION_TARGET_CHECK = "approval_policy_auto_approval_conditions_check";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
    TableName.ApprovalPolicyAutoApprovalConditions,
    CONDITION_TARGET_CHECK
  ]);
  // A check on the requester's own Infisical user or groups reads no input, connection or prompt
  await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
    t.check('num_nonnulls("inputId", "connectionId", "prompt") <= 1', [], CONDITION_TARGET_CHECK);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Dropping only the requester check would leave its rule approving on the remaining checks alone
  await knex(TableName.ApprovalPolicyAutoApprovalRules)
    .whereIn(
      "id",
      knex(TableName.ApprovalPolicyAutoApprovalConditions)
        .select("ruleId")
        .whereNull("inputId")
        .whereNull("connectionId")
        .whereNull("prompt")
    )
    .delete();
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
    TableName.ApprovalPolicyAutoApprovalConditions,
    CONDITION_TARGET_CHECK
  ]);
  await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
    t.check(
      '("inputId" IS NOT NULL AND "connectionId" IS NULL AND "prompt" IS NULL) OR ("inputId" IS NULL AND "connectionId" IS NOT NULL AND "prompt" IS NULL) OR ("inputId" IS NULL AND "connectionId" IS NULL AND "prompt" IS NOT NULL)',
      [],
      CONDITION_TARGET_CHECK
    );
  });
}
