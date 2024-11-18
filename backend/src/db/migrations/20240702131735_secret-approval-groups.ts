import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // migrate secret approval policy approvers to user id
  const hasApproverUserId = await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverUserId");
  const hasApproverId = await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverId");
  if (!hasApproverUserId) {
    // add the new fields
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (tb) => {
      // if (hasApproverId) tb.setNullable("approverId");
      tb.uuid("approverUserId");
      tb.foreign("approverUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });

    // convert project membership id => user id
    await knex(TableName.SecretApprovalPolicyApprover).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      approverUserId: knex(TableName.ProjectMembership)
        .select("userId")
        .where("id", knex.raw("??", [`${TableName.SecretApprovalPolicyApprover}.approverId`]))
    });
    // drop the old field
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (tb) => {
      if (hasApproverId) tb.dropColumn("approverId");
      tb.uuid("approverUserId").notNullable().alter();
    });
  }

  // migrate secret approval request committer and statusChangeBy to user id
  const hasSecretApprovalRequestTable = await knex.schema.hasTable(TableName.SecretApprovalRequest);
  const hasCommitterUserId = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerUserId");
  const hasCommitterId = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerId");
  const hasStatusChangeBy = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "statusChangeBy");
  const hasStatusChangedByUserId = await knex.schema.hasColumn(
    TableName.SecretApprovalRequest,
    "statusChangedByUserId"
  );
  if (hasSecretApprovalRequestTable) {
    // new fields
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
      // if (hasCommitterId) tb.setNullable("committerId");
      if (!hasCommitterUserId) {
        tb.uuid("committerUserId");
        tb.foreign("committerUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      }
      if (!hasStatusChangedByUserId) {
        tb.uuid("statusChangedByUserId");
        tb.foreign("statusChangedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      }
    });

    // copy the assigned project membership => user id to new fields
    await knex(TableName.SecretApprovalRequest).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      committerUserId: knex(TableName.ProjectMembership)
        .select("userId")
        .where("id", knex.raw("??", [`${TableName.SecretApprovalRequest}.committerId`])),
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      statusChangedByUserId: knex(TableName.ProjectMembership)
        .select("userId")
        .where("id", knex.raw("??", [`${TableName.SecretApprovalRequest}.statusChangeBy`]))
    });
    // drop old fields
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
      if (hasStatusChangeBy) tb.dropColumn("statusChangeBy");
      if (hasCommitterId) tb.dropColumn("committerId");
      tb.uuid("committerUserId").notNullable().alter();
    });
  }

  // migrate secret approval request reviewer to user id
  const hasMemberId = await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "member");
  const hasReviewerUserId = await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "reviewerUserId");
  if (!hasReviewerUserId) {
    // new fields
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (tb) => {
      // if (hasMemberId) tb.setNullable("member");
      tb.uuid("reviewerUserId");
      tb.foreign("reviewerUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
    });
    // copy project membership => user id to new fields
    await knex(TableName.SecretApprovalRequestReviewer).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      reviewerUserId: knex(TableName.ProjectMembership)
        .select("userId")
        .where("id", knex.raw("??", [`${TableName.SecretApprovalRequestReviewer}.member`]))
    });
    // drop table
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (tb) => {
      if (hasMemberId) tb.dropColumn("member");
      tb.uuid("reviewerUserId").notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasApproverUserId = await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverUserId");
  const hasApproverId = await knex.schema.hasColumn(TableName.SecretApprovalPolicyApprover, "approverId");
  if (hasApproverUserId) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (tb) => {
      if (!hasApproverId) {
        tb.uuid("approverId");
        tb.foreign("approverId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      }
    });

    if (!hasApproverId) {
      await knex(TableName.SecretApprovalPolicyApprover).update({
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        approverId: knex(TableName.ProjectMembership)
          .join(
            TableName.SecretApprovalPolicy,
            `${TableName.SecretApprovalPolicy}.id`,
            `${TableName.SecretApprovalPolicyApprover}.policyId`
          )
          .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretApprovalPolicy}.envId`)
          .select(knex.ref("id").withSchema(TableName.ProjectMembership))
          .where(`${TableName.ProjectMembership}.projectId`, knex.raw("??", [`${TableName.Environment}.projectId`]))
          .where("userId", knex.raw("??", [`${TableName.SecretApprovalPolicyApprover}.approverUserId`]))
      });
      await knex.schema.alterTable(TableName.SecretApprovalPolicyApprover, (tb) => {
        tb.dropColumn("approverUserId");
        tb.uuid("approverId").notNullable().alter();
      });
    }
  }

  const hasSecretApprovalRequestTable = await knex.schema.hasTable(TableName.SecretApprovalRequest);
  const hasCommitterUserId = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerUserId");
  const hasCommitterId = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerId");
  const hasStatusChangeBy = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "statusChangeBy");
  const hasStatusChangedByUser = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "statusChangedByUserId");
  if (hasSecretApprovalRequestTable) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
      // if (hasCommitterId) tb.uuid("committerId").notNullable().alter();
      if (!hasCommitterId) {
        tb.uuid("committerId");
        tb.foreign("committerId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      }
      if (!hasStatusChangeBy) {
        tb.uuid("statusChangeBy");
        tb.foreign("statusChangeBy").references("id").inTable(TableName.ProjectMembership).onDelete("SET NULL");
      }
    });

    await knex(TableName.SecretApprovalRequest).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      committerId: knex(TableName.ProjectMembership)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalRequest}.policyId`
        )
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretApprovalPolicy}.envId`)
        .where(`${TableName.ProjectMembership}.projectId`, knex.raw("??", [`${TableName.Environment}.projectId`]))
        .where("userId", knex.raw("??", [`${TableName.SecretApprovalRequest}.committerUserId`]))
        .select(knex.ref("id").withSchema(TableName.ProjectMembership)),
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      statusChangeBy: knex(TableName.ProjectMembership)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalRequest}.policyId`
        )
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretApprovalPolicy}.envId`)
        .where(`${TableName.ProjectMembership}.projectId`, knex.raw("??", [`${TableName.Environment}.projectId`]))
        .where("userId", knex.raw("??", [`${TableName.SecretApprovalRequest}.statusChangedByUserId`]))
        .select(knex.ref("id").withSchema(TableName.ProjectMembership))
    });

    await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
      if (hasCommitterUserId) tb.dropColumn("committerUserId");
      if (hasStatusChangedByUser) tb.dropColumn("statusChangedByUserId");
      if (hasCommitterId) tb.uuid("committerId").notNullable().alter();
    });
  }

  const hasMemberId = await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "member");
  const hasReviewerUserId = await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "reviewerUserId");
  if (hasReviewerUserId) {
    if (!hasMemberId) {
      await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (tb) => {
        // if (hasMemberId) tb.uuid("member").notNullable().alter();
        tb.uuid("member");
        tb.foreign("member").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      });
    }
    await knex(TableName.SecretApprovalRequestReviewer).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      member: knex(TableName.ProjectMembership)
        .join(
          TableName.SecretApprovalRequest,
          `${TableName.SecretApprovalRequest}.id`,
          `${TableName.SecretApprovalRequestReviewer}.requestId`
        )
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalRequest}.policyId`
        )
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretApprovalPolicy}.envId`)
        .where(`${TableName.ProjectMembership}.projectId`, knex.raw("??", [`${TableName.Environment}.projectId`]))
        .where("userId", knex.raw("??", [`${TableName.SecretApprovalRequestReviewer}.reviewerUserId`]))
        .select(knex.ref("id").withSchema(TableName.ProjectMembership))
    });
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (tb) => {
      tb.uuid("member").notNullable().alter();
      tb.dropColumn("reviewerUserId");
    });
  }
}
