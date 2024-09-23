import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AccessApprovalPolicyApprover)) {
    // add column approverGroupId to AccessApprovalPolicyApprover
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (table) => {
      // make nullable
      table.uuid("approverGroupId").nullable().references("id").inTable(TableName.Groups).onDelete("CASCADE");
      // make approverUserId nullable
      table.uuid("approverUserId").nullable().alter();
    });
    // add column approverGroupId to SecretApprovalPolicyApprover
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (table) => {
      table.uuid("approverGroupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      table.uuid("approverUserId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AccessApprovalPolicyApprover)) {
    // remove
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (table) => {
      table.dropColumn("approverGroupId");
      table.uuid("approverUserId").notNullable().alter();
    });

    // remove
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (table) => {
      table.dropColumn("approverGroupId");
      table.uuid("approverUserId").notNullable().alter();
    });
  }
}
