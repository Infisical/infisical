import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // SecretApprovalPolicyApprover, approverUserId
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverUserId"))) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (t) => {
      t.uuid("approverId").nullable().alter();

      t.uuid("approverUserId").nullable();
      t.foreign("approverUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }

  // SecretApprovalRequest, statusChangeByUserId
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalRequest, "statusChangeByUserId"))) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      t.uuid("statusChangeBy").nullable().alter();

      t.uuid("statusChangeByUserId").nullable();
      t.foreign("statusChangeByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
    });
  }

  // SecretApprovalRequest, committerUserId
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerUserId"))) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      t.uuid("committerId").nullable().alter();

      t.uuid("committerUserId").nullable();
      t.foreign("committerUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }

  // SecretApprovalRequestReviewer, memberUserId
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "memberUserId"))) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (t) => {
      t.uuid("member").nullable().alter();

      t.uuid("memberUserId").nullable();
      t.foreign("memberUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverUserId")) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (t) => {
      t.dropColumn("approverUserId");
    });
  }

  if (await knex.schema.hasColumn(TableName.SecretApprovalRequest, "statusChangeByUserId")) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      t.dropColumn("statusChangeByUserId");
    });
  }

  if (await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerUserId")) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      t.dropColumn("committerUserId");
    });
  }

  if (await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "memberUserId")) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (t) => {
      t.dropColumn("memberUserId");
    });
  }
}
