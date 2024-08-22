import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // ---------- ACCESS APPROVAL POLICY APPROVER ------------
  const hasApproverUserId = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "approverUserId");
  const hasApproverId = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "approverId");

  if (!hasApproverUserId) {
    // add the new fields
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (tb) => {
      // if (hasApproverId) tb.setNullable("approverId");
      tb.uuid("approverUserId");
      tb.foreign("approverUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });

    // convert project membership id => user id
    await knex(TableName.AccessApprovalPolicyApprover).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      approverUserId: knex(TableName.ProjectMembership)
        .select("userId")
        .where("id", knex.raw("??", [`${TableName.AccessApprovalPolicyApprover}.approverId`]))
    });
    // drop the old field
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (tb) => {
      if (hasApproverId) tb.dropColumn("approverId");
      tb.uuid("approverUserId").notNullable().alter();
    });
  }

  // ---------- ACCESS APPROVAL REQUEST ------------
  const hasAccessApprovalRequestTable = await knex.schema.hasTable(TableName.AccessApprovalRequest);
  const hasRequestedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "requestedByUserId");
  const hasRequestedBy = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "requestedBy");

  if (hasAccessApprovalRequestTable) {
    // new fields
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (tb) => {
      if (!hasRequestedByUserId) {
        tb.uuid("requestedByUserId");
        tb.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      }
    });

    // copy the assigned project membership => user id to new fields
    await knex(TableName.AccessApprovalRequest).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      requestedByUserId: knex(TableName.ProjectMembership)
        .select("userId")
        .where("id", knex.raw("??", [`${TableName.AccessApprovalRequest}.requestedBy`]))
    });
    // drop old fields
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (tb) => {
      if (hasRequestedBy) {
        // DROP AT A LATER TIME
        // tb.dropColumn("requestedBy");

        // ADD ALLOW NULLABLE FOR NOW
        tb.uuid("requestedBy").nullable().alter();
      }
      tb.uuid("requestedByUserId").notNullable().alter();
    });
  }

  // ---------- ACCESS APPROVAL REQUEST REVIEWER ------------
  const hasMemberId = await knex.schema.hasColumn(TableName.AccessApprovalRequestReviewer, "member");
  const hasReviewerUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequestReviewer, "reviewerUserId");
  if (!hasReviewerUserId) {
    // new fields
    await knex.schema.alterTable(TableName.AccessApprovalRequestReviewer, (tb) => {
      // if (hasMemberId) tb.setNullable("member");
      tb.uuid("reviewerUserId");
      tb.foreign("reviewerUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
    });
    // copy project membership => user id to new fields
    await knex(TableName.AccessApprovalRequestReviewer).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      reviewerUserId: knex(TableName.ProjectMembership)
        .select("userId")
        .where("id", knex.raw("??", [`${TableName.AccessApprovalRequestReviewer}.member`]))
    });
    // drop table
    await knex.schema.alterTable(TableName.AccessApprovalRequestReviewer, (tb) => {
      if (hasMemberId) {
        // DROP AT A LATER TIME
        // tb.dropColumn("member");

        // ADD ALLOW NULLABLE FOR NOW
        tb.uuid("member").nullable().alter();
      }
      tb.uuid("reviewerUserId").notNullable().alter();
    });
  }

  // ---------- PROJECT USER ADDITIONAL PRIVILEGE ------------
  const projectUserAdditionalPrivilegeHasProjectMembershipId = await knex.schema.hasColumn(
    TableName.ProjectUserAdditionalPrivilege,
    "projectMembershipId"
  );

  const projectUserAdditionalPrivilegeHasUserId = await knex.schema.hasColumn(
    TableName.ProjectUserAdditionalPrivilege,
    "userId"
  );

  if (!projectUserAdditionalPrivilegeHasUserId) {
    await knex.schema.alterTable(TableName.ProjectUserAdditionalPrivilege, (tb) => {
      tb.uuid("userId");
      tb.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      tb.string("projectId");
      tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });

    await knex(TableName.ProjectUserAdditionalPrivilege)
      .update({
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        userId: knex(TableName.ProjectMembership)
          .select("userId")
          .where("id", knex.raw("??", [`${TableName.ProjectUserAdditionalPrivilege}.projectMembershipId`])),

        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        projectId: knex(TableName.ProjectMembership)
          .select("projectId")
          .where("id", knex.raw("??", [`${TableName.ProjectUserAdditionalPrivilege}.projectMembershipId`]))
      })
      .whereNotNull("projectMembershipId");

    await knex.schema.alterTable(TableName.ProjectUserAdditionalPrivilege, (tb) => {
      tb.uuid("userId").notNullable().alter();
      tb.string("projectId").notNullable().alter();
    });
  }

  if (projectUserAdditionalPrivilegeHasProjectMembershipId) {
    await knex.schema.alterTable(TableName.ProjectUserAdditionalPrivilege, (tb) => {
      // DROP AT A LATER TIME
      // tb.dropColumn("projectMembershipId");

      // ADD ALLOW NULLABLE FOR NOW
      tb.uuid("projectMembershipId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // We remove project user additional privileges first, because it may delete records in the database where the project membership is not found.
  // The project membership won't be found on records created by group members. In those cades we just delete the record and continue.
  // When the additionl privilege record is deleted, it will cascade delete the access request created by the group member.

  // ---------- PROJECT USER ADDITIONAL PRIVILEGE ------------
  const hasUserId = await knex.schema.hasColumn(TableName.ProjectUserAdditionalPrivilege, "userId");
  const hasProjectMembershipId = await knex.schema.hasColumn(
    TableName.ProjectUserAdditionalPrivilege,
    "projectMembershipId"
  );

  // If it doesn't have the userId field, then the up migration has not run
  if (!hasUserId) {
    return;
  }

  await knex.schema.alterTable(TableName.ProjectUserAdditionalPrivilege, (tb) => {
    if (!hasProjectMembershipId) {
      tb.uuid("projectMembershipId");
      tb.foreign("projectMembershipId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
    }
  });

  if (!hasProjectMembershipId) {
    // First, update records where a matching project membership exists
    await knex(TableName.ProjectUserAdditionalPrivilege).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      projectMembershipId: knex(TableName.ProjectMembership)
        .select("id")
        .where("userId", knex.raw("??", [`${TableName.ProjectUserAdditionalPrivilege}.userId`]))
    });

    await knex(TableName.AccessApprovalRequest).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      projectMembershipId: knex(TableName.ProjectMembership)
        .select("id")
        .where("userId", knex.raw("??", [`${TableName.SecretApprovalRequest}.userId`]))
    });

    await knex.schema.alterTable(TableName.ProjectUserAdditionalPrivilege, (tb) => {
      tb.dropColumn("userId");
      tb.dropColumn("projectId");

      tb.uuid("projectMembershipId").notNullable().alter();
    });
  }

  // Then, delete records where no matching project membership was found
  await knex(TableName.ProjectUserAdditionalPrivilege).whereNull("projectMembershipId").delete();
  await knex(TableName.AccessApprovalRequest).whereNull("requestedBy").delete();

  // ---------- ACCESS APPROVAL POLICY APPROVER ------------
  const hasApproverUserId = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "approverUserId");
  const hasApproverId = await knex.schema.hasColumn(TableName.AccessApprovalPolicyApprover, "approverId");

  if (hasApproverUserId) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (tb) => {
      if (!hasApproverId) {
        tb.uuid("approverId");
        tb.foreign("approverId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      }
    });

    if (!hasApproverId) {
      await knex(TableName.AccessApprovalPolicyApprover).update({
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        approverId: knex(TableName.ProjectMembership)
          .select("id")
          .where("userId", knex.raw("??", [`${TableName.AccessApprovalPolicyApprover}.approverUserId`]))
      });
      await knex.schema.alterTable(TableName.AccessApprovalPolicyApprover, (tb) => {
        tb.dropColumn("approverUserId");

        tb.uuid("approverId").notNullable().alter();
      });
    }

    // ---------- ACCESS APPROVAL REQUEST ------------
    const hasAccessApprovalRequestTable = await knex.schema.hasTable(TableName.AccessApprovalRequest);
    const hasRequestedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "requestedByUserId");
    const hasRequestedBy = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "requestedBy");

    if (hasAccessApprovalRequestTable) {
      await knex.schema.alterTable(TableName.AccessApprovalRequest, (tb) => {
        if (!hasRequestedBy) {
          tb.uuid("requestedBy");
          tb.foreign("requestedBy").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
        }
      });

      // Try to find a project membership based on the AccessApprovalRequest.requestedByUserId and AccessApprovalRequest.policyId(reference to AccessApprovalRequestPolicy).envId(reference to Environment).projectId(reference to Project)
      // If a project membership is found, set the AccessApprovalRequest.requestedBy to the project membership id
      // If a project membership is not found, remove the AccessApprovalRequest record

      await knex(TableName.AccessApprovalRequest).update({
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        requestedBy: knex(TableName.ProjectMembership)
          .select("id")
          .where("userId", knex.raw("??", [`${TableName.AccessApprovalRequest}.requestedByUserId`]))
      });

      // Then, delete records where no matching project membership was found
      await knex(TableName.AccessApprovalRequest).whereNull("requestedBy").delete();

      await knex.schema.alterTable(TableName.AccessApprovalRequest, (tb) => {
        if (hasRequestedByUserId) {
          tb.dropColumn("requestedByUserId");
        }
        if (hasRequestedBy) tb.uuid("requestedBy").notNullable().alter();
      });
    }

    // ---------- ACCESS APPROVAL REQUEST REVIEWER ------------
    const hasMemberId = await knex.schema.hasColumn(TableName.AccessApprovalRequestReviewer, "member");
    const hasReviewerUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequestReviewer, "reviewerUserId");

    if (hasReviewerUserId) {
      if (!hasMemberId) {
        await knex.schema.alterTable(TableName.AccessApprovalRequestReviewer, (tb) => {
          tb.uuid("member");
          tb.foreign("member").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
        });
      }
      await knex(TableName.AccessApprovalRequestReviewer).update({
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        member: knex(TableName.ProjectMembership)
          .select("id")
          .where("userId", knex.raw("??", [`${TableName.AccessApprovalRequestReviewer}.reviewerUserId`]))
      });
      await knex.schema.alterTable(TableName.AccessApprovalRequestReviewer, (tb) => {
        tb.dropColumn("reviewerUserId");

        tb.uuid("member").notNullable().alter();
      });
    }
  }
}
