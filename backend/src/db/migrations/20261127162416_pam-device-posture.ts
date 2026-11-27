import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const CONDITION_TARGET_CHECK = "approval_policy_auto_approval_conditions_check";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamDeviceVerification))) {
    await knex.schema.createTable(TableName.PamDeviceVerification, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.uuid("accountId").notNullable();
      t.foreign("accountId").references("id").inTable(TableName.PamAccount).onDelete("CASCADE");
      t.index("accountId");

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.index("userId");

      t.string("code").nullable();
      t.unique("code");

      t.string("accessType").notNullable();
      t.boolean("forAutoApproval").notNullable().defaultTo(false);
      t.string("status").notNullable();
      t.text("message").nullable();
      t.string("deviceSerialNumber").nullable();
      t.jsonb("device").nullable();
      t.jsonb("checks").nullable();
      t.jsonb("facts").nullable();

      t.datetime("expiresAt", { useTz: true }).notNullable();
      t.index("expiresAt");
      t.datetime("completedAt", { useTz: true }).nullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PamDeviceVerification);
  }

  if (!(await knex.schema.hasColumn(TableName.ApprovalPolicyAutoApprovalConditions, "config"))) {
    await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
      t.jsonb("config").nullable();
    });
  }
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
    TableName.ApprovalPolicyAutoApprovalConditions,
    CONDITION_TARGET_CHECK
  ]);
  await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
    t.check('num_nonnulls("inputId", "connectionId", "prompt", "config") <= 1', [], CONDITION_TARGET_CHECK);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ApprovalPolicyAutoApprovalConditions, "config")) {
    // Dropping only the device check would leave its rule approving on the remaining checks alone
    await knex(TableName.ApprovalPolicyAutoApprovalRules)
      .whereIn("id", knex(TableName.ApprovalPolicyAutoApprovalConditions).select("ruleId").whereNotNull("config"))
      .delete();
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
      TableName.ApprovalPolicyAutoApprovalConditions,
      CONDITION_TARGET_CHECK
    ]);
    await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
      t.dropColumn("config");
    });
    await knex.schema.alterTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
      t.check('num_nonnulls("inputId", "connectionId", "prompt") <= 1', [], CONDITION_TARGET_CHECK);
    });
  }

  if (await knex.schema.hasTable(TableName.PamDeviceVerification)) {
    await dropOnUpdateTrigger(knex, TableName.PamDeviceVerification);
    await knex.schema.dropTable(TableName.PamDeviceVerification);
  }
}
