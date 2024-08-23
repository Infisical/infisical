import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessApprovalRequestsSchema, TableName, TAccessApprovalRequests, TUsers } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

import { ApprovalStatus } from "./access-approval-request-types";

export type TAccessApprovalRequestDALFactory = ReturnType<typeof accessApprovalRequestDALFactory>;

export const accessApprovalRequestDALFactory = (db: TDbClient) => {
  const accessApprovalRequestOrm = ormify(db, TableName.AccessApprovalRequest);

  const findRequestsWithPrivilegeByPolicyIds = async (policyIds: string[]) => {
    try {
      const docs = await db
        .replicaNode()(TableName.AccessApprovalRequest)
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

        .join<TUsers>(
          db(TableName.Users).as("requestedByUser"),
          `${TableName.AccessApprovalRequest}.requestedByUserId`,
          `requestedByUser.id`
        )

        .leftJoin(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)

        .select(selectAllTableCols(TableName.AccessApprovalRequest))
        .select(
          db.ref("id").withSchema(TableName.AccessApprovalPolicy).as("policyId"),
          db.ref("name").withSchema(TableName.AccessApprovalPolicy).as("policyName"),
          db.ref("approvals").withSchema(TableName.AccessApprovalPolicy).as("policyApprovals"),
          db.ref("secretPath").withSchema(TableName.AccessApprovalPolicy).as("policySecretPath"),
          db.ref("enforcementLevel").withSchema(TableName.AccessApprovalPolicy).as("policyEnforcementLevel"),
          db.ref("envId").withSchema(TableName.AccessApprovalPolicy).as("policyEnvId")
        )

        .select(db.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover))

        .select(
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )

        .select(
          db.ref("reviewerUserId").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerUserId"),
          db.ref("status").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerStatus")
        )

        // TODO: ADD SUPPORT FOR GROUPS!!!!
        .select(
          db.ref("email").withSchema("requestedByUser").as("requestedByUserEmail"),
          db.ref("username").withSchema("requestedByUser").as("requestedByUserUsername"),
          db.ref("firstName").withSchema("requestedByUser").as("requestedByUserFirstName"),
          db.ref("lastName").withSchema("requestedByUser").as("requestedByUserLastName"),

          db.ref("userId").withSchema(TableName.ProjectUserAdditionalPrivilege).as("privilegeUserId"),
          db.ref("projectId").withSchema(TableName.ProjectUserAdditionalPrivilege).as("privilegeMembershipId"),

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
            enforcementLevel: doc.policyEnforcementLevel,
            envId: doc.policyEnvId
          },
          requestedByUser: {
            userId: doc.requestedByUserId,
            email: doc.requestedByUserEmail,
            firstName: doc.requestedByUserFirstName,
            lastName: doc.requestedByUserLastName,
            username: doc.requestedByUserUsername
          },
          privilege: doc.privilegeId
            ? {
                membershipId: doc.privilegeMembershipId,
                userId: doc.privilegeUserId,
                projectId: doc.projectId,
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
            mapper: ({ reviewerUserId: userId, reviewerStatus: status }) => (userId ? { userId, status } : undefined)
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

      .join<TUsers>(
        db(TableName.Users).as("requestedByUser"),
        `${TableName.AccessApprovalRequest}.requestedByUserId`,
        `requestedByUser.id`
      )

      .join(
        TableName.AccessApprovalPolicyApprover,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyApprover}.policyId`
      )

      .join<TUsers>(
        db(TableName.Users).as("accessApprovalPolicyApproverUser"),
        `${TableName.AccessApprovalPolicyApprover}.approverUserId`,
        "accessApprovalPolicyApproverUser.id"
      )

      .leftJoin(
        TableName.AccessApprovalRequestReviewer,
        `${TableName.AccessApprovalRequest}.id`,
        `${TableName.AccessApprovalRequestReviewer}.requestId`
      )

      .leftJoin<TUsers>(
        db(TableName.Users).as("accessApprovalReviewerUser"),
        `${TableName.AccessApprovalRequestReviewer}.reviewerUserId`,
        `accessApprovalReviewerUser.id`
      )

      .leftJoin(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .select(selectAllTableCols(TableName.AccessApprovalRequest))
      .select(
        tx.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover),
        tx.ref("email").withSchema("accessApprovalPolicyApproverUser").as("approverEmail"),
        tx.ref("username").withSchema("accessApprovalPolicyApproverUser").as("approverUsername"),
        tx.ref("firstName").withSchema("accessApprovalPolicyApproverUser").as("approverFirstName"),
        tx.ref("lastName").withSchema("accessApprovalPolicyApproverUser").as("approverLastName"),
        tx.ref("email").withSchema("requestedByUser").as("requestedByUserEmail"),
        tx.ref("username").withSchema("requestedByUser").as("requestedByUserUsername"),
        tx.ref("firstName").withSchema("requestedByUser").as("requestedByUserFirstName"),
        tx.ref("lastName").withSchema("requestedByUser").as("requestedByUserLastName"),

        tx.ref("reviewerUserId").withSchema(TableName.AccessApprovalRequestReviewer),

        tx.ref("status").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerStatus"),

        tx.ref("email").withSchema("accessApprovalReviewerUser").as("reviewerEmail"),
        tx.ref("username").withSchema("accessApprovalReviewerUser").as("reviewerUsername"),
        tx.ref("firstName").withSchema("accessApprovalReviewerUser").as("reviewerFirstName"),
        tx.ref("lastName").withSchema("accessApprovalReviewerUser").as("reviewerLastName"),

        tx.ref("id").withSchema(TableName.AccessApprovalPolicy).as("policyId"),
        tx.ref("name").withSchema(TableName.AccessApprovalPolicy).as("policyName"),
        tx.ref("projectId").withSchema(TableName.Environment),
        tx.ref("slug").withSchema(TableName.Environment).as("environment"),
        tx.ref("secretPath").withSchema(TableName.AccessApprovalPolicy).as("policySecretPath"),
        tx.ref("enforcementLevel").withSchema(TableName.AccessApprovalPolicy).as("policyEnforcementLevel"),
        tx.ref("approvals").withSchema(TableName.AccessApprovalPolicy).as("policyApprovals")
      );

  const findById = async (id: string, tx?: Knex) => {
    try {
      const sql = findQuery({ [`${TableName.AccessApprovalRequest}.id` as "id"]: id }, tx || db.replicaNode());
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
            secretPath: el.policySecretPath,
            enforcementLevel: el.policyEnforcementLevel
          },
          requestedByUser: {
            userId: el.requestedByUserId,
            email: el.requestedByUserEmail,
            firstName: el.requestedByUserFirstName,
            lastName: el.requestedByUserLastName,
            username: el.requestedByUserUsername
          }
        }),
        childrenMapper: [
          {
            key: "reviewerUserId",
            label: "reviewers" as const,
            mapper: ({
              reviewerUserId: userId,
              reviewerStatus: status,
              reviewerEmail: email,
              reviewerLastName: lastName,
              reviewerUsername: username,
              reviewerFirstName: firstName
            }) => (userId ? { userId, status, email, firstName, lastName, username } : undefined)
          },
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({
              approverUserId,
              approverEmail: email,
              approverUsername: username,
              approverLastName: lastName,
              approverFirstName: firstName
            }) => ({
              userId: approverUserId,
              email,
              firstName,
              lastName,
              username
            })
          }
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
      const accessRequests = await db
        .replicaNode()(TableName.AccessApprovalRequest)
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
        .select(db.ref("reviewerUserId").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerUserId"));

      const formattedRequests = sqlNestRelationships({
        data: accessRequests,
        key: "id",
        parentMapper: (doc) => ({
          ...AccessApprovalRequestsSchema.parse(doc)
        }),
        childrenMapper: [
          {
            key: "reviewerUserId",
            label: "reviewers" as const,
            mapper: ({ reviewerUserId: reviewer, reviewerStatus: status }) =>
              reviewer ? { reviewer, status } : undefined
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
