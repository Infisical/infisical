import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const CONDITION_TARGET_CHECK = "approval_policy_auto_approval_conditions_check";
const CONTEXT_CONNECTION_FOREIGN_KEY = "auto_approval_condition_contexts_connectionid_foreign";

export async function up(knex: Knex): Promise<void> {
  const hasAiConnectionId = await knex.schema.hasColumn(TableName.Organization, "aiConnectionId");
  const hasAiModel = await knex.schema.hasColumn(TableName.Organization, "aiModel");
  if (!hasAiConnectionId || !hasAiModel) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      if (!hasAiConnectionId) {
        t.uuid("aiConnectionId").nullable().index();
        t.foreign("aiConnectionId").references("id").inTable(TableName.AppConnection);
      }
      if (!hasAiModel) t.string("aiModel", 128).nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.ApprovalPolicyAutoApprovalConditions, "prompt"))) {
    await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
      t.text("prompt").nullable();
    });

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

  if (!(await knex.schema.hasTable(TableName.ApprovalPolicyAutoApprovalConditionContexts))) {
    await knex.schema.createTable(TableName.ApprovalPolicyAutoApprovalConditionContexts, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("conditionId").notNullable();
      t.foreign("conditionId")
        .references("id")
        .inTable(TableName.ApprovalPolicyAutoApprovalConditions)
        .onDelete("CASCADE");

      t.uuid("connectionId").notNullable().index();
      t.foreign("connectionId", CONTEXT_CONNECTION_FOREIGN_KEY)
        .references("id")
        .inTable(TableName.AppConnection)
        .deferrable("deferred");

      t.unique(["conditionId", "connectionId"]);

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalConditionContexts);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalConditionContexts);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicyAutoApprovalConditionContexts);

  if (await knex.schema.hasColumn(TableName.ApprovalPolicyAutoApprovalConditions, "prompt")) {
    // Dropping only the AI condition would leave its rule approving on the remaining checks alone
    await knex(TableName.ApprovalPolicyAutoApprovalRules)
      .whereIn("id", knex(TableName.ApprovalPolicyAutoApprovalConditions).select("ruleId").whereNotNull("prompt"))
      .delete();
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
      TableName.ApprovalPolicyAutoApprovalConditions,
      CONDITION_TARGET_CHECK
    ]);
    await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
      t.dropColumn("prompt");
    });
    await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
      t.check(
        '("inputId" IS NOT NULL AND "connectionId" IS NULL) OR ("inputId" IS NULL AND "connectionId" IS NOT NULL)',
        [],
        CONDITION_TARGET_CHECK
      );
    });
  }

  const hasAiConnectionId = await knex.schema.hasColumn(TableName.Organization, "aiConnectionId");
  const hasAiModel = await knex.schema.hasColumn(TableName.Organization, "aiModel");
  if (hasAiConnectionId || hasAiModel) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      if (hasAiConnectionId) t.dropColumn("aiConnectionId");
      if (hasAiModel) t.dropColumn("aiModel");
    });
  }
}
