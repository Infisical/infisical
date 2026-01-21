import { Knex } from "knex";

import { TableName } from "../schemas";
import { dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.GroupProjectMembershipRole);
  await knex.schema.dropTableIfExists(TableName.GroupProjectMembershipRole);

  await dropOnUpdateTrigger(knex, TableName.GroupProjectMembership);
  await knex.schema.dropTableIfExists(TableName.GroupProjectMembership);

  await dropOnUpdateTrigger(knex, TableName.IdentityProjectAdditionalPrivilege);
  await knex.schema.dropTableIfExists(TableName.IdentityProjectAdditionalPrivilege);

  await dropOnUpdateTrigger(knex, TableName.IdentityProjectMembershipRole);
  await knex.schema.dropTableIfExists(TableName.IdentityProjectMembershipRole);

  await dropOnUpdateTrigger(knex, TableName.IdentityProjectMembership);
  await knex.schema.dropTableIfExists(TableName.IdentityProjectMembership);

  await dropOnUpdateTrigger(knex, TableName.ProjectUserAdditionalPrivilege);
  await knex.schema.dropTableIfExists(TableName.ProjectUserAdditionalPrivilege);

  await dropOnUpdateTrigger(knex, TableName.ProjectUserMembershipRole);
  await knex.schema.dropTableIfExists(TableName.ProjectUserMembershipRole);

  // before dropping membership need to remove some dependent fields
  const hasMembershipInApprovalRequestTable = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "requestedBy"
  );
  if (hasMembershipInApprovalRequestTable) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropColumn("requestedBy");
    });
  }

  const hasMembershipInApprovalRequestReviewerTable = await knex.schema.hasColumn(
    TableName.AccessApprovalRequestReviewer,
    "member"
  );
  if (hasMembershipInApprovalRequestReviewerTable) {
    await knex.schema.alterTable(TableName.AccessApprovalRequestReviewer, (t) => {
      t.dropColumn("member");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.ProjectMembership);
  await knex.schema.dropTableIfExists(TableName.ProjectMembership);

  await dropOnUpdateTrigger(knex, TableName.ProjectRoles);
  await knex.schema.dropTableIfExists(TableName.ProjectRoles);

  await dropOnUpdateTrigger(knex, TableName.IdentityOrgMembership);
  await knex.schema.dropTableIfExists(TableName.IdentityOrgMembership);

  await dropOnUpdateTrigger(knex, TableName.OrgMembership);
  await knex.schema.dropTableIfExists(TableName.OrgMembership);

  const hasOrgRoleIdInGroup = await knex.schema.hasColumn(TableName.Groups, "roleId");
  const hasRoleInGroup = await knex.schema.hasColumn(TableName.Groups, "role");
  if (hasOrgRoleIdInGroup || hasRoleInGroup) {
    await knex.schema.alterTable(TableName.Groups, (t) => {
      if (hasOrgRoleIdInGroup) t.dropColumn("roleId");
      if (hasRoleInGroup) t.dropColumn("role");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.OrgRoles);
  await knex.schema.dropTableIfExists(TableName.OrgRoles);
}

export async function down(): Promise<void> {
  // sometimes life is all about moving forward
}
