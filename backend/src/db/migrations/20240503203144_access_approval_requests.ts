import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AccessApprovalRequest))) {
    await knex.schema.createTable(TableName.AccessApprovalRequest, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AccessApprovalPolicy).onDelete("CASCADE");

      t.uuid("projectUserPrivilegeId").nullable();
      t.foreign("projectUserPrivilegeId")
        .references("id")
        .inTable(TableName.ProjectUserAdditionalPrivilege)
        .onDelete("CASCADE");

      t.uuid("groupProjectUserPrivilegeId").nullable();
      t.foreign("groupProjectUserPrivilegeId")
        .references("id")
        .inTable(TableName.GroupProjectUserAdditionalPrivilege)
        .onDelete("CASCADE");

      t.uuid("requestedByUserId").notNullable();
      t.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("projectMembershipId").nullable();
      t.foreign("projectMembershipId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");

      t.uuid("groupMembershipId").nullable();
      t.foreign("groupMembershipId").references("id").inTable(TableName.GroupProjectMembership).onDelete("CASCADE");

      // We use these values to create the actual privilege at a later point in time.
      t.boolean("isTemporary").notNullable();
      t.string("temporaryRange").nullable();

      t.jsonb("permissions").notNullable();

      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.AccessApprovalRequest);

  if (!(await knex.schema.hasTable(TableName.AccessApprovalRequestReviewer))) {
    await knex.schema.createTable(TableName.AccessApprovalRequestReviewer, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("memberUserId").notNullable();
      t.foreign("memberUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.string("status").notNullable();
      t.uuid("requestId").notNullable();
      t.foreign("requestId").references("id").inTable(TableName.AccessApprovalRequest).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.AccessApprovalRequestReviewer);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AccessApprovalRequestReviewer);
  await knex.schema.dropTableIfExists(TableName.AccessApprovalRequest);

  await dropOnUpdateTrigger(knex, TableName.AccessApprovalRequestReviewer);
  await dropOnUpdateTrigger(knex, TableName.AccessApprovalRequest);
}
