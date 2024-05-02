import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessApprovalRequestsSchema, TableName, TAccessApprovalRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

import { ApprovalStatus } from "./access-approval-request-types";

export type TAccessApprovalRequestDALFactory = ReturnType<typeof accessApprovalRequestDALFactory>;

export const accessApprovalRequestDALFactory = (db: TDbClient) => {
  const accessApprovalRequestOrm = ormify(db, TableName.AccessApprovalRequest);

  const findRequestsWithPrivilegeByPolicyIds = async (policyIds: string[]) => {
    try {
      const docs = await db(TableName.AccessApprovalRequest)
        .whereIn(`${TableName.AccessApprovalRequest}.policyId`, policyIds)

        .leftJoin(
          TableName.ProjectUserAdditionalPrivilege,
          `${TableName.AccessApprovalRequest}.privilegeId`,
          `${TableName.ProjectUserAdditionalPrivilege}.id`
        )
        .leftJoin(
          TableName.AccessApprovalPolicy,
          `${TableName.AccessApprovalRequest}.policyId`,
          `${TableName.AccessApprovalPolicy}.id`
        )

        .leftJoin(
          TableName.AccessApprovalRequestReviewer,
          `${TableName.AccessApprovalRequest}.id`,
          `${TableName.AccessApprovalRequestReviewer}.requestId`
        )
        .leftJoin(
          TableName.AccessApprovalPolicyApprover,
          `${TableName.AccessApprovalPolicy}.id`,
          `${TableName.AccessApprovalPolicyApprover}.policyId`
        )

        .leftJoin(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)

        .select(selectAllTableCols(TableName.AccessApprovalRequest))
        .select(
          db.ref("id").withSchema(TableName.AccessApprovalPolicy).as("policyId"),
          db.ref("name").withSchema(TableName.AccessApprovalPolicy).as("policyName"),
          db.ref("approvals").withSchema(TableName.AccessApprovalPolicy).as("policyApprovals"),
          db.ref("secretPath").withSchema(TableName.AccessApprovalPolicy).as("policySecretPath"),
          db.ref("envId").withSchema(TableName.AccessApprovalPolicy).as("policyEnvId")
        )

        .select(db.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover))

        .select(
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )

        .select(
          db.ref("memberUserId").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerUserId"),
          db.ref("status").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerStatus")
        )

        .select(
          db
            .ref("projectMembershipId")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("privilegeProjectMembershipId"),
          db
            .ref("groupMembershipId")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("privilegeGroupMembershipId"),
          db.ref("isTemporary").withSchema(TableName.ProjectUserAdditionalPrivilege).as("privilegeIsTemporary"),
          db.ref("temporaryMode").withSchema(TableName.ProjectUserAdditionalPrivilege).as("privilegeTemporaryMode"),
          db.ref("temporaryRange").withSchema(TableName.ProjectUserAdditionalPrivilege).as("privilegeTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("privilegeTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("privilegeTemporaryAccessEndTime"),

          db.ref("permissions").withSchema(TableName.ProjectUserAdditionalPrivilege).as("privilegePermissions")
        )
        .orderBy(`${TableName.AccessApprovalRequest}.createdAt`, "desc");

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (doc) => ({
          ...AccessApprovalRequestsSchema.parse(doc),
          projectId: doc.projectId,
          environment: doc.envSlug,
          environmentName: doc.envName,
          policy: {
            id: doc.policyId,
            name: doc.policyName,
            approvals: doc.policyApprovals,
            secretPath: doc.policySecretPath,
            envId: doc.policyEnvId
          },
          privilege: doc.privilegeId
            ? {
                projectMembershipId: doc.privilegeGroupMembershipId,
                groupMembershipId: doc.privilegeGroupMembershipId,
                isTemporary: doc.privilegeIsTemporary,
                temporaryMode: doc.privilegeTemporaryMode,
                temporaryRange: doc.privilegeTemporaryRange,
                temporaryAccessStartTime: doc.privilegeTemporaryAccessStartTime,
                temporaryAccessEndTime: doc.privilegeTemporaryAccessEndTime,
                permissions: doc.privilegePermissions
              }
            : null,

          isApproved: !!doc.privilegeId
        }),
        childrenMapper: [
          {
            key: "reviewerUserId",
            label: "reviewers" as const,
            mapper: ({ reviewerUserId, reviewerStatus: status }) =>
              reviewerUserId ? { member: reviewerUserId, status } : undefined
          },
          { key: "approverUserId", label: "approvers" as const, mapper: ({ approverUserId }) => approverUserId }
        ]
      });

      if (!formattedDocs) return [];

      return formattedDocs.map((doc) => ({
        ...doc,
        policy: { ...doc.policy, approvers: doc.approvers }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRequestsWithPrivilege" });
    }
  };

  const findQuery = (filter: TFindFilter<TAccessApprovalRequests>, tx: Knex) =>
    tx(TableName.AccessApprovalRequest)
      .where(filter)
      .join(
        TableName.AccessApprovalPolicy,
        `${TableName.AccessApprovalRequest}.policyId`,
        `${TableName.AccessApprovalPolicy}.id`
      )

      .join(
        TableName.AccessApprovalPolicyApprover,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyApprover}.policyId`
      )
      .leftJoin(
        TableName.AccessApprovalRequestReviewer,
        `${TableName.AccessApprovalRequest}.id`,
        `${TableName.AccessApprovalRequestReviewer}.requestId`
      )

      .leftJoin(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .select(selectAllTableCols(TableName.AccessApprovalRequest))
      .select(
        tx.ref("memberUserId").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerUserId"),
        tx.ref("status").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerStatus"),
        tx.ref("id").withSchema(TableName.AccessApprovalPolicy).as("policyId"),
        tx.ref("name").withSchema(TableName.AccessApprovalPolicy).as("policyName"),
        tx.ref("projectId").withSchema(TableName.Environment),
        tx.ref("slug").withSchema(TableName.Environment).as("environment"),
        tx.ref("secretPath").withSchema(TableName.AccessApprovalPolicy).as("policySecretPath"),
        tx.ref("approvals").withSchema(TableName.AccessApprovalPolicy).as("policyApprovals"),
        tx.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover)
      );

  const findById = async (id: string, tx?: Knex) => {
    try {
      const sql = findQuery({ [`${TableName.AccessApprovalRequest}.id` as "id"]: id }, tx || db);
      const docs = await sql;
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...AccessApprovalRequestsSchema.parse(el),
          projectId: el.projectId,
          environment: el.environment,
          policy: {
            id: el.policyId,
            name: el.policyName,
            approvals: el.policyApprovals,
            secretPath: el.policySecretPath
          }
        }),
        childrenMapper: [
          {
            key: "reviewerUserId",
            label: "reviewers" as const,
            mapper: ({ reviewerUserId, reviewerStatus: status }) =>
              reviewerUserId ? { member: reviewerUserId, status } : undefined
          },
          { key: "approverUserId", label: "approvers" as const, mapper: ({ approverUserId }) => approverUserId }
        ]
      });
      if (!formatedDoc?.[0]) return;
      return {
        ...formatedDoc[0],
        policy: { ...formatedDoc[0].policy, approvers: formatedDoc[0].approvers }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdAccessApprovalRequest" });
    }
  };

  const getCount = async ({ projectId }: { projectId: string }) => {
    try {
      const accessRequests = await db(TableName.AccessApprovalRequest)
        .leftJoin(
          TableName.AccessApprovalPolicy,
          `${TableName.AccessApprovalRequest}.policyId`,
          `${TableName.AccessApprovalPolicy}.id`
        )
        .leftJoin(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)
        .leftJoin(
          TableName.ProjectUserAdditionalPrivilege,
          `${TableName.AccessApprovalRequest}.privilegeId`,
          `${TableName.ProjectUserAdditionalPrivilege}.id`
        )

        .leftJoin(
          TableName.AccessApprovalRequestReviewer,
          `${TableName.AccessApprovalRequest}.id`,
          `${TableName.AccessApprovalRequestReviewer}.requestId`
        )

        .where(`${TableName.Environment}.projectId`, projectId)
        .select(selectAllTableCols(TableName.AccessApprovalRequest))
        .select(db.ref("status").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerStatus"))
        .select(db.ref("memberUserId").withSchema(TableName.AccessApprovalRequestReviewer).as("memberUserId"));

      const formattedRequests = sqlNestRelationships({
        data: accessRequests,
        key: "id",
        parentMapper: (doc) => ({
          ...AccessApprovalRequestsSchema.parse(doc)
        }),
        childrenMapper: [
          {
            key: "memberUserId",
            label: "reviewers" as const,
            mapper: ({ memberUserId, reviewerStatus: status }) =>
              memberUserId ? { member: memberUserId, status } : undefined
          }
        ]
      });

      // an approval is pending if there is no reviewer rejections and no privilege ID is set
      const pendingApprovals = formattedRequests.filter(
        (req) => !req.privilegeId && !req.reviewers.some((r) => r.status === ApprovalStatus.REJECTED)
      );

      // an approval is finalized if there are any rejections or a privilege ID is set
      const finalizedApprovals = formattedRequests.filter(
        (req) => req.privilegeId || req.reviewers.some((r) => r.status === ApprovalStatus.REJECTED)
      );

      return { pendingCount: pendingApprovals.length, finalizedCount: finalizedApprovals.length };
    } catch (error) {
      throw new DatabaseError({ error, name: "GetCountAccessApprovalRequest" });
    }
  };

  return { ...accessApprovalRequestOrm, findById, findRequestsWithPrivilegeByPolicyIds, getCount };
};
