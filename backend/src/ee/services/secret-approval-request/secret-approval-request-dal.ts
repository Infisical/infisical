import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  SecretApprovalRequestsSchema,
  TableName,
  TSecretApprovalRequests,
  TSecretApprovalRequestsSecrets,
  TUsers
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships, stripUndefinedInWhere, TFindFilter } from "@app/lib/knex";

import { RequestState } from "./secret-approval-request-types";

export type TSecretApprovalRequestDALFactory = ReturnType<typeof secretApprovalRequestDALFactory>;

type TFindQueryFilter = {
  projectId: string;
  userId: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
};

export const secretApprovalRequestDALFactory = (db: TDbClient) => {
  const secretApprovalRequestOrm = ormify(db, TableName.SecretApprovalRequest);

  const findQuery = (filter: TFindFilter<TSecretApprovalRequests>, tx: Knex) =>
    tx(TableName.SecretApprovalRequest)
      .where(filter)
      .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(
        TableName.SecretApprovalPolicy,
        `${TableName.SecretApprovalRequest}.policyId`,
        `${TableName.SecretApprovalPolicy}.id`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("statusChangedByUser"),
        `${TableName.SecretApprovalRequest}.statusChangedByUserId`,
        `statusChangedByUser.id`
      )
      .join<TUsers>(
        db(TableName.Users).as("committerUser"),
        `${TableName.SecretApprovalRequest}.committerUserId`,
        `committerUser.id`
      )
      .join(
        TableName.SecretApprovalPolicyApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyApprover}.policyId`
      )
      .join<TUsers>(
        db(TableName.Users).as("secretApprovalPolicyApproverUser"),
        `${TableName.SecretApprovalPolicyApprover}.approverUserId`,
        "secretApprovalPolicyApproverUser.id"
      )
      .leftJoin(
        TableName.SecretApprovalRequestReviewer,
        `${TableName.SecretApprovalRequest}.id`,
        `${TableName.SecretApprovalRequestReviewer}.requestId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("secretApprovalReviewerUser"),
        `${TableName.SecretApprovalRequestReviewer}.reviewerUserId`,
        `secretApprovalReviewerUser.id`
      )
      .select(selectAllTableCols(TableName.SecretApprovalRequest))
      .select(
        tx.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover),
        tx.ref("email").withSchema("secretApprovalPolicyApproverUser").as("approverEmail"),
        tx.ref("username").withSchema("secretApprovalPolicyApproverUser").as("approverUsername"),
        tx.ref("firstName").withSchema("secretApprovalPolicyApproverUser").as("approverFirstName"),
        tx.ref("lastName").withSchema("secretApprovalPolicyApproverUser").as("approverLastName"),
        tx.ref("email").withSchema("statusChangedByUser").as("statusChangedByUserEmail"),
        tx.ref("username").withSchema("statusChangedByUser").as("statusChangedByUserUsername"),
        tx.ref("firstName").withSchema("statusChangedByUser").as("statusChangedByUserFirstName"),
        tx.ref("lastName").withSchema("statusChangedByUser").as("statusChangedByUserLastName"),
        tx.ref("email").withSchema("committerUser").as("committerUserEmail"),
        tx.ref("username").withSchema("committerUser").as("committerUserUsername"),
        tx.ref("firstName").withSchema("committerUser").as("committerUserFirstName"),
        tx.ref("lastName").withSchema("committerUser").as("committerUserLastName"),
        tx.ref("reviewerUserId").withSchema(TableName.SecretApprovalRequestReviewer),
        tx.ref("status").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerStatus"),
        tx.ref("email").withSchema("secretApprovalReviewerUser").as("reviewerEmail"),
        tx.ref("username").withSchema("secretApprovalReviewerUser").as("reviewerUsername"),
        tx.ref("firstName").withSchema("secretApprovalReviewerUser").as("reviewerFirstName"),
        tx.ref("lastName").withSchema("secretApprovalReviewerUser").as("reviewerLastName"),
        tx.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"),
        tx.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"),
        tx.ref("projectId").withSchema(TableName.Environment),
        tx.ref("slug").withSchema(TableName.Environment).as("environment"),
        tx.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
        tx.ref("envId").withSchema(TableName.SecretApprovalPolicy).as("policyEnvId"),
        tx.ref("enforcementLevel").withSchema(TableName.SecretApprovalPolicy).as("policyEnforcementLevel"),
        tx.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals")
      );

  const findById = async (id: string, tx?: Knex) => {
    try {
      const sql = findQuery({ [`${TableName.SecretApprovalRequest}.id` as "id"]: id }, tx || db.replicaNode());
      const docs = await sql;
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...SecretApprovalRequestsSchema.parse(el),
          projectId: el.projectId,
          environment: el.environment,
          statusChangedByUser: el.statusChangedByUserId
            ? {
                userId: el.statusChangedByUserId,
                email: el.statusChangedByUserEmail,
                firstName: el.statusChangedByUserFirstName,
                lastName: el.statusChangedByUserLastName,
                username: el.statusChangedByUserUsername
              }
            : undefined,
          committerUser: {
            userId: el.committerUserId,
            email: el.committerUserEmail,
            firstName: el.committerUserFirstName,
            lastName: el.committerUserLastName,
            username: el.committerUserUsername
          },
          policy: {
            id: el.policyId,
            name: el.policyName,
            approvals: el.policyApprovals,
            secretPath: el.policySecretPath,
            enforcementLevel: el.policyEnforcementLevel,
            envId: el.policyEnvId
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
      throw new DatabaseError({ error, name: "FindByIdSAR" });
    }
  };

  const findProjectRequestCount = async (projectId: string, userId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db)
        .with(
          "temp",
          (tx || db.replicaNode())(TableName.SecretApprovalRequest)
            .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .join(
              TableName.SecretApprovalPolicyApprover,
              `${TableName.SecretApprovalRequest}.policyId`,
              `${TableName.SecretApprovalPolicyApprover}.policyId`
            )
            .where({ projectId })
            .andWhere(
              (bd) =>
                void bd
                  .where(`${TableName.SecretApprovalPolicyApprover}.approverUserId`, userId)
                  .orWhere(`${TableName.SecretApprovalRequest}.committerUserId`, userId)
            )
            .select("status", `${TableName.SecretApprovalRequest}.id`)
            .groupBy(`${TableName.SecretApprovalRequest}.id`, "status")
            .count("status")
        )
        .select("status")
        .from("temp")
        .groupBy("status")
        .count("status");

      return {
        open: parseInt(
          (docs.find(({ status }) => status === RequestState.Open) as { count: string })?.count || "0",
          10
        ),
        closed: parseInt(
          (docs.find(({ status }) => status === RequestState.Closed) as { count: string })?.count || "0",
          10
        )
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRequestCount" });
    }
  };

  const findByProjectId = async (
    { status, limit = 20, offset = 0, projectId, committer, environment, userId }: TFindQueryFilter,
    tx?: Knex
  ) => {
    try {
      // akhilmhdh: If ever u wanted a 1 to so many relationship connected with pagination
      // this is the place u wanna look at.
      const query = (tx || db.replicaNode())(TableName.SecretApprovalRequest)
        .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalRequest}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        .join(
          TableName.SecretApprovalPolicyApprover,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalPolicyApprover}.policyId`
        )
        .join<TUsers>(
          db(TableName.Users).as("committerUser"),
          `${TableName.SecretApprovalRequest}.committerUserId`,
          `committerUser.id`
        )
        .leftJoin(
          TableName.SecretApprovalRequestReviewer,
          `${TableName.SecretApprovalRequest}.id`,
          `${TableName.SecretApprovalRequestReviewer}.requestId`
        )
        .leftJoin<TSecretApprovalRequestsSecrets>(
          TableName.SecretApprovalRequestSecret,
          `${TableName.SecretApprovalRequestSecret}.requestId`,
          `${TableName.SecretApprovalRequest}.id`
        )
        .where(
          stripUndefinedInWhere({
            projectId,
            [`${TableName.Environment}.slug` as "slug"]: environment,
            [`${TableName.SecretApprovalRequest}.status`]: status,
            committerUserId: committer
          })
        )
        .andWhere(
          (bd) =>
            void bd
              .where(`${TableName.SecretApprovalPolicyApprover}.approverUserId`, userId)
              .orWhere(`${TableName.SecretApprovalRequest}.committerUserId`, userId)
        )
        .select(selectAllTableCols(TableName.SecretApprovalRequest))
        .select(
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerId"),
          db.ref("reviewerUserId").withSchema(TableName.SecretApprovalRequestReviewer),
          db.ref("status").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerStatus"),
          db.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"),
          db.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"),
          db.ref("op").withSchema(TableName.SecretApprovalRequestSecret).as("commitOp"),
          db.ref("secretId").withSchema(TableName.SecretApprovalRequestSecret).as("commitSecretId"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecret).as("commitId"),
          db.raw(
            `DENSE_RANK() OVER (partition by ${TableName.Environment}."projectId" ORDER BY ${TableName.SecretApprovalRequest}."id" DESC) as rank`
          ),
          db.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
          db.ref("enforcementLevel").withSchema(TableName.SecretApprovalPolicy).as("policyEnforcementLevel"),
          db.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"),
          db.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover),
          db.ref("email").withSchema("committerUser").as("committerUserEmail"),
          db.ref("username").withSchema("committerUser").as("committerUserUsername"),
          db.ref("firstName").withSchema("committerUser").as("committerUserFirstName"),
          db.ref("lastName").withSchema("committerUser").as("committerUserLastName")
        )
        .orderBy("createdAt", "desc");

      const docs = await (tx || db)
        .with("w", query)
        .select("*")
        .from<Awaited<typeof query>[number]>("w")
        .where("w.rank", ">=", offset)
        .andWhere("w.rank", "<", offset + limit);
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...SecretApprovalRequestsSchema.parse(el),
          environment: el.environment,
          projectId: el.projectId,
          policy: {
            id: el.policyId,
            name: el.policyName,
            approvals: el.policyApprovals,
            secretPath: el.policySecretPath,
            enforcementLevel: el.policyEnforcementLevel
          },
          committerUser: {
            userId: el.committerUserId,
            email: el.committerUserEmail,
            firstName: el.committerUserFirstName,
            lastName: el.committerUserLastName,
            username: el.committerUserUsername
          }
        }),
        childrenMapper: [
          {
            key: "reviewerId",
            label: "reviewers" as const,
            mapper: ({ reviewerUserId, reviewerStatus: s }) =>
              reviewerUserId ? { userId: reviewerUserId, status: s } : undefined
          },
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({ approverUserId }) => approverUserId
          },
          {
            key: "commitId",
            label: "commits" as const,
            mapper: ({ commitSecretId: secretId, commitId: id, commitOp: op }) => ({
              op,
              id,
              secretId
            })
          }
        ]
      });
      return formatedDoc.map((el) => ({
        ...el,
        policy: { ...el.policy, approvers: el.approvers }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSAR" });
    }
  };

  const findByProjectIdBridgeSecretV2 = async (
    { status, limit = 20, offset = 0, projectId, committer, environment, userId }: TFindQueryFilter,
    tx?: Knex
  ) => {
    try {
      // akhilmhdh: If ever u wanted a 1 to so many relationship connected with pagination
      // this is the place u wanna look at.
      const query = (tx || db.replicaNode())(TableName.SecretApprovalRequest)
        .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalRequest}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        .join(
          TableName.SecretApprovalPolicyApprover,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalPolicyApprover}.policyId`
        )
        .join<TUsers>(
          db(TableName.Users).as("committerUser"),
          `${TableName.SecretApprovalRequest}.committerUserId`,
          `committerUser.id`
        )
        .leftJoin(
          TableName.SecretApprovalRequestReviewer,
          `${TableName.SecretApprovalRequest}.id`,
          `${TableName.SecretApprovalRequestReviewer}.requestId`
        )
        .leftJoin<TSecretApprovalRequestsSecrets>(
          TableName.SecretApprovalRequestSecretV2,
          `${TableName.SecretApprovalRequestSecretV2}.requestId`,
          `${TableName.SecretApprovalRequest}.id`
        )
        .where(
          stripUndefinedInWhere({
            projectId,
            [`${TableName.Environment}.slug` as "slug"]: environment,
            [`${TableName.SecretApprovalRequest}.status`]: status,
            committerUserId: committer
          })
        )
        .andWhere(
          (bd) =>
            void bd
              .where(`${TableName.SecretApprovalPolicyApprover}.approverUserId`, userId)
              .orWhere(`${TableName.SecretApprovalRequest}.committerUserId`, userId)
        )
        .select(selectAllTableCols(TableName.SecretApprovalRequest))
        .select(
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerId"),
          db.ref("reviewerUserId").withSchema(TableName.SecretApprovalRequestReviewer),
          db.ref("status").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerStatus"),
          db.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"),
          db.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"),
          db.ref("op").withSchema(TableName.SecretApprovalRequestSecretV2).as("commitOp"),
          db.ref("secretId").withSchema(TableName.SecretApprovalRequestSecretV2).as("commitSecretId"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecretV2).as("commitId"),
          db.raw(
            `DENSE_RANK() OVER (partition by ${TableName.Environment}."projectId" ORDER BY ${TableName.SecretApprovalRequest}."id" DESC) as rank`
          ),
          db.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
          db.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"),
          db.ref("enforcementLevel").withSchema(TableName.SecretApprovalPolicy).as("policyEnforcementLevel"),
          db.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover),
          db.ref("email").withSchema("committerUser").as("committerUserEmail"),
          db.ref("username").withSchema("committerUser").as("committerUserUsername"),
          db.ref("firstName").withSchema("committerUser").as("committerUserFirstName"),
          db.ref("lastName").withSchema("committerUser").as("committerUserLastName")
        )
        .orderBy("createdAt", "desc");

      const docs = await (tx || db)
        .with("w", query)
        .select("*")
        .from<Awaited<typeof query>[number]>("w")
        .where("w.rank", ">=", offset)
        .andWhere("w.rank", "<", offset + limit);
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...SecretApprovalRequestsSchema.parse(el),
          environment: el.environment,
          projectId: el.projectId,
          policy: {
            id: el.policyId,
            name: el.policyName,
            approvals: el.policyApprovals,
            secretPath: el.policySecretPath,
            enforcementLevel: el.policyEnforcementLevel
          },
          committerUser: {
            userId: el.committerUserId,
            email: el.committerUserEmail,
            firstName: el.committerUserFirstName,
            lastName: el.committerUserLastName,
            username: el.committerUserUsername
          }
        }),
        childrenMapper: [
          {
            key: "reviewerId",
            label: "reviewers" as const,
            mapper: ({ reviewerUserId, reviewerStatus: s }) =>
              reviewerUserId ? { userId: reviewerUserId, status: s } : undefined
          },
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({ approverUserId }) => approverUserId
          },
          {
            key: "commitId",
            label: "commits" as const,
            mapper: ({ commitSecretId: secretId, commitId: id, commitOp: op }) => ({
              op,
              id,
              secretId
            })
          }
        ]
      });
      return formatedDoc.map((el) => ({
        ...el,
        policy: { ...el.policy, approvers: el.approvers }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSAR" });
    }
  };

  const deleteByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const query = await (tx || db)(TableName.SecretApprovalRequest)
        .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where({ projectId })
        .delete();

      return query;
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByProjectId" });
    }
  };

  return {
    ...secretApprovalRequestOrm,
    findById,
    findProjectRequestCount,
    findByProjectId,
    findByProjectIdBridgeSecretV2,
    deleteByProjectId
  };
};
