import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // --- SECRET APPROVALS START ----

  const hasNewColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "memberUserId");

  if (!hasNewColumn) {
    await knex.schema.alterTable(TableName.ProjectUserAdditionalPrivilege, (t) => {
      // add new "groupProjectId" column
      t.string("groupProjectId").nullable();
      t.foreign("groupProjectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });

    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (t) => {
      t.uuid("approverId").nullable().alter();

      // add new "approverUserId" column
      t.uuid("approverUserId").nullable();
      t.foreign("approverUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });

    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      t.uuid("statusChangeBy").nullable().alter();
      t.uuid("committerId").nullable().alter();

      t.string("projectId").nullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      // add new "statusChangeByUserId" column
      t.uuid("statusChangeByUserId").nullable();
      t.foreign("statusChangeByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");

      // add new "committerUserId" column
      t.uuid("committerUserId").nullable();
      t.foreign("committerUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (t) => {
      t.uuid("member").nullable().alter();

      // add new "memberUserId" column
      t.uuid("memberUserId").nullable();
      t.foreign("memberUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasNewColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "memberUserId");

  // Warning: Dropping multiple columns in migration!
  if (hasNewColumn) {
    await knex.schema.alterTable(TableName.ProjectUserAdditionalPrivilege, (t) => {
      // t.uuid("groupProjectId").notNullable().alter();
      t.dropColumn("groupProjectId");
    });

    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (t) => {
      // t.uuid("approverId").notNullable().alter();
      t.dropColumn("approverUserId");
    });

    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      // t.uuid("statusChangeBy").notNullable().alter();
      // t.uuid("committerId").notNullable().alter();
      t.dropColumn("statusChangeByUserId");
      t.dropColumn("committerUserId");
      t.dropColumn("projectId");
    });

    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (t) => {
      // t.uuid("member").notNullable().alter();
      t.dropColumn("memberUserId");
    });
  }
}
