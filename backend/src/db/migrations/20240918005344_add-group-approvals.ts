import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAccessApproverGroupId = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicyApprover,
    "approverGroupId"
  );
  const hasAccessApproverUserId = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "approverUserId");
  const hasSecretApproverGroupId = await knex.schema.hasColumn(
    TableName.SecretApprovalPolicyApprover,
    "approverGroupId"
  );
  const hasSecretApproverUserId = await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverUserId");
  if (await knex.schema.hasTable(TableName.AccessApprovalPolicyApprover)) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (table) => {
      // add column approverGroupId to AccessApprovalPolicyApprover
      if (!hasAccessApproverGroupId) {
        table.uuid("approverGroupId").nullable().references("id").inTable(TableName.Groups).onDelete("CASCADE");
      }

      // make approverUserId nullable
      if (hasAccessApproverUserId) {
        table.uuid("approverUserId").nullable().alter();
      }
    });
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (table) => {
      // add column approverGroupId to SecretApprovalPolicyApprover
      if (!hasSecretApproverGroupId) {
        table.uuid("approverGroupId").nullable().references("id").inTable(TableName.Groups).onDelete("CASCADE");
      }

      // make approverUserId nullable
      if (hasSecretApproverUserId) {
        table.uuid("approverUserId").nullable().alter();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAccessApproverGroupId = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicyApprover,
    "approverGroupId"
  );
  const hasAccessApproverUserId = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "approverUserId");
  const hasSecretApproverGroupId = await knex.schema.hasColumn(
    TableName.SecretApprovalPolicyApprover,
    "approverGroupId"
  );
  const hasSecretApproverUserId = await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverUserId");

  if (await knex.schema.hasTable(TableName.AccessApprovalPolicyApprover)) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (table) => {
      if (hasAccessApproverGroupId) {
        table.dropColumn("approverGroupId");
      }
      // make approverUserId not nullable
      if (hasAccessApproverUserId) {
        table.uuid("approverUserId").notNullable().alter();
      }
    });

    // remove
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (table) => {
      if (hasSecretApproverGroupId) {
        table.dropColumn("approverGroupId");
      }
      // make approverUserId not nullable
      if (hasSecretApproverUserId) {
        table.uuid("approverUserId").notNullable().alter();
      }
    });
  }
}
