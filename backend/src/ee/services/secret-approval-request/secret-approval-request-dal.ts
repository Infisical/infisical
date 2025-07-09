import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  SecretApprovalRequestsSchema,
  TableName,
  TSecretApprovalRequests,
  TSecretApprovalRequestsSecrets,
  TUserGroupMembership,
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
  search?: string;
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
      .leftJoin(
        TableName.SecretApprovalPolicyApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyApprover}.policyId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("secretApprovalPolicyApproverUser"),
        `${TableName.SecretApprovalPolicyApprover}.approverUserId`,
        "secretApprovalPolicyApproverUser.id"
      )
      .leftJoin<TUserGroupMembership>(
        db(TableName.UserGroupMembership).as("approverUserGroupMembership"),
        `${TableName.SecretApprovalPolicyApprover}.approverGroupId`,
        `approverUserGroupMembership.groupId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("secretApprovalPolicyGroupApproverUser"),
        `approverUserGroupMembership.userId`,
        `secretApprovalPolicyGroupApproverUser.id`
      )
      .leftJoin(
        TableName.SecretApprovalPolicyBypasser,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyBypasser}.policyId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("secretApprovalPolicyBypasserUser"),
        `${TableName.SecretApprovalPolicyBypasser}.bypasserUserId`,
        "secretApprovalPolicyBypasserUser.id"
      )
      .leftJoin<TUserGroupMembership>(
        db(TableName.UserGroupMembership).as("bypasserUserGroupMembership"),
        `${TableName.SecretApprovalPolicyBypasser}.bypasserGroupId`,
        `bypasserUserGroupMembership.groupId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("secretApprovalPolicyGroupBypasserUser"),
        `bypasserUserGroupMembership.userId`,
        `secretApprovalPolicyGroupBypasserUser.id`
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
        tx.ref("userId").withSchema("approverUserGroupMembership").as("approverGroupUserId"),
        tx.ref("email").withSchema("secretApprovalPolicyApproverUser").as("approverEmail"),
        tx.ref("email").withSchema("secretApprovalPolicyGroupApproverUser").as("approverGroupEmail"),
        tx.ref("username").withSchema("secretApprovalPolicyApproverUser").as("approverUsername"),
        tx.ref("username").withSchema("secretApprovalPolicyGroupApproverUser").as("approverGroupUsername"),
        tx.ref("firstName").withSchema("secretApprovalPolicyApproverUser").as("approverFirstName"),
        tx.ref("firstName").withSchema("secretApprovalPolicyGroupApproverUser").as("approverGroupFirstName"),
        tx.ref("lastName").withSchema("secretApprovalPolicyApproverUser").as("approverLastName"),
        tx.ref("lastName").withSchema("secretApprovalPolicyGroupApproverUser").as("approverGroupLastName"),

        // Bypasser fields
        tx.ref("bypasserUserId").withSchema(TableName.SecretApprovalPolicyBypasser),
        tx.ref("bypasserGroupId").withSchema(TableName.SecretApprovalPolicyBypasser),
        tx.ref("userId").withSchema("bypasserUserGroupMembership").as("bypasserGroupUserId"),
        tx.ref("email").withSchema("secretApprovalPolicyBypasserUser").as("bypasserEmail"),
        tx.ref("email").withSchema("secretApprovalPolicyGroupBypasserUser").as("bypasserGroupEmail"),
        tx.ref("username").withSchema("secretApprovalPolicyBypasserUser").as("bypasserUsername"),
        tx.ref("username").withSchema("secretApprovalPolicyGroupBypasserUser").as("bypasserGroupUsername"),
        tx.ref("firstName").withSchema("secretApprovalPolicyBypasserUser").as("bypasserFirstName"),
        tx.ref("firstName").withSchema("secretApprovalPolicyGroupBypasserUser").as("bypasserGroupFirstName"),
        tx.ref("lastName").withSchema("secretApprovalPolicyBypasserUser").as("bypasserLastName"),
        tx.ref("lastName").withSchema("secretApprovalPolicyGroupBypasserUser").as("bypasserGroupLastName"),

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
        tx.ref("comment").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerComment"),
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
        tx.ref("allowedSelfApprovals").withSchema(TableName.SecretApprovalPolicy).as("policyAllowedSelfApprovals"),
        tx.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"),
        tx.ref("deletedAt").withSchema(TableName.SecretApprovalPolicy).as("policyDeletedAt")
      );

  const findById = async (id: string, tx?: Knex) => {
    try {
      const sql = findQuery({ [`${TableName.SecretApprovalRequest}.id` as "id"]: id }, tx || db.replicaNode());
      const docs = await sql;
      const formattedDoc = sqlNestRelationships({
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
            envId: el.policyEnvId,
            deletedAt: el.policyDeletedAt,
            allowedSelfApprovals: el.policyAllowedSelfApprovals
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
              reviewerFirstName: firstName,
              reviewerComment: comment
            }) =>
              userId ? { userId, status, email, firstName, lastName, username, comment: comment ?? "" } : undefined
          },
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({
              approverUserId: userId,
              approverEmail: email,
              approverUsername: username,
              approverLastName: lastName,
              approverFirstName: firstName
            }) => ({
              userId,
              email,
              firstName,
              lastName,
              username
            })
          },
          {
            key: "approverGroupUserId",
            label: "approvers" as const,
            mapper: ({
              approverGroupUserId: userId,
              approverGroupEmail: email,
              approverGroupUsername: username,
              approverGroupLastName: lastName,
              approverGroupFirstName: firstName
            }) => ({
              userId,
              email,
              firstName,
              lastName,
              username
            })
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({
              bypasserUserId: userId,
              bypasserEmail: email,
              bypasserUsername: username,
              bypasserLastName: lastName,
              bypasserFirstName: firstName
            }) => ({
              userId,
              email,
              firstName,
              lastName,
              username
            })
          },
          {
            key: "bypasserGroupUserId",
            label: "bypassers" as const,
            mapper: ({
              bypasserGroupUserId: userId,
              bypasserGroupEmail: email,
              bypasserGroupUsername: username,
              bypasserGroupLastName: lastName,
              bypasserGroupFirstName: firstName
            }) => ({
              userId,
              email,
              firstName,
              lastName,
              username
            })
          }
        ]
      });
      if (!formattedDoc?.[0]) return;
      return {
        ...formattedDoc[0],
        policy: {
          ...formattedDoc[0].policy,
          approvers: formattedDoc[0].approvers,
          bypassers: formattedDoc[0].bypassers
        }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdSAR" });
    }
  };

  const findProjectRequestCount = async (projectId: string, userId: string, policyId?: string, tx?: Knex) => {
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
            .join(
              TableName.SecretApprovalPolicy,
              `${TableName.SecretApprovalRequest}.policyId`,
              `${TableName.SecretApprovalPolicy}.id`
            )
            .where({ projectId })
            .where((qb) => {
              if (policyId) void qb.where(`${TableName.SecretApprovalPolicy}.id`, policyId);
            })
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
    { status, limit = 20, offset = 0, projectId, committer, environment, userId, search }: TFindQueryFilter,
    tx?: Knex
  ) => {
    try {
      // akhilmhdh: If ever u wanted a 1 to so many relationship connected with pagination
      // this is the place u wanna look at.
      const innerQuery = (tx || db.replicaNode())(TableName.SecretApprovalRequest)
        .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalRequest}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        .leftJoin(
          TableName.SecretApprovalPolicyApprover,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalPolicyApprover}.policyId`
        )
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.SecretApprovalPolicyApprover}.approverGroupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .leftJoin(
          TableName.SecretApprovalPolicyBypasser,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalPolicyBypasser}.policyId`
        )
        .leftJoin<TUserGroupMembership>(
          db(TableName.UserGroupMembership).as("bypasserUserGroupMembership"),
          `${TableName.SecretApprovalPolicyBypasser}.bypasserGroupId`,
          `bypasserUserGroupMembership.groupId`
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
              .orWhere(`${TableName.UserGroupMembership}.userId`, userId)
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
            `DENSE_RANK() OVER (PARTITION BY ${TableName.Environment}."projectId" ORDER BY ${TableName.SecretApprovalRequest}."createdAt" DESC) as rank`
          ),
          db.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
          db.ref("enforcementLevel").withSchema(TableName.SecretApprovalPolicy).as("policyEnforcementLevel"),
          db.ref("allowedSelfApprovals").withSchema(TableName.SecretApprovalPolicy).as("policyAllowedSelfApprovals"),
          db.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"),
          db.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover),
          db.ref("userId").withSchema(TableName.UserGroupMembership).as("approverGroupUserId"),

          // Bypasser fields
          db.ref("bypasserUserId").withSchema(TableName.SecretApprovalPolicyBypasser),
          db.ref("userId").withSchema("bypasserUserGroupMembership").as("bypasserGroupUserId"),

          db.ref("email").withSchema("committerUser").as("committerUserEmail"),
          db.ref("username").withSchema("committerUser").as("committerUserUsername"),
          db.ref("firstName").withSchema("committerUser").as("committerUserFirstName"),
          db.ref("lastName").withSchema("committerUser").as("committerUserLastName")
        )
        .distinctOn(`${TableName.SecretApprovalRequest}.id`)
        .as("inner");

      const query = (tx || db)
        .select("*")
        .select(db.raw("count(*) OVER() as total_count"))
        .from(innerQuery)
        .orderBy("createdAt", "desc") as typeof innerQuery;

      if (search) {
        void query.where((qb) => {
          void qb
            .whereRaw(`CONCAT_WS(' ', ??, ??) ilike ?`, [
              db.ref("firstName").withSchema("committerUser"),
              db.ref("lastName").withSchema("committerUser"),
              `%${search}%`
            ])
            .orWhereRaw(`?? ilike ?`, [db.ref("username").withSchema("committerUser"), `%${search}%`])
            .orWhereRaw(`?? ilike ?`, [db.ref("email").withSchema("committerUser"), `%${search}%`])
            .orWhereILike(`${TableName.Environment}.name`, `%${search}%`)
            .orWhereILike(`${TableName.Environment}.slug`, `%${search}%`)
            .orWhereILike(`${TableName.SecretApprovalPolicy}.secretPath`, `%${search}%`);
        });
      }

      const docs = await (tx || db)
        .with("w", query)
        .select("*")
        .from<Awaited<typeof query>[number]>("w")
        .where("w.rank", ">=", offset)
        .andWhere("w.rank", "<", offset + limit);

      // @ts-expect-error knex does not infer
      const totalCount = Number(docs[0]?.total_count || 0);

      const formattedDoc = sqlNestRelationships({
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
            enforcementLevel: el.policyEnforcementLevel,
            allowedSelfApprovals: el.policyAllowedSelfApprovals
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
            mapper: ({ approverUserId }) => ({ userId: approverUserId })
          },
          {
            key: "commitId",
            label: "commits" as const,
            mapper: ({ commitSecretId: secretId, commitId: id, commitOp: op }) => ({
              op,
              id,
              secretId
            })
          },
          {
            key: "approverGroupUserId",
            label: "approvers" as const,
            mapper: ({ approverGroupUserId }) => ({ userId: approverGroupUserId })
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserUserId }) => ({ userId: bypasserUserId })
          },
          {
            key: "bypasserGroupUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserGroupUserId }) => ({ userId: bypasserGroupUserId })
          }
        ]
      });
      return {
        approvals: formattedDoc.map((el) => ({
          ...el,
          policy: { ...el.policy, approvers: el.approvers, bypassers: el.bypassers }
        })),
        totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSAR" });
    }
  };

  const findByProjectIdBridgeSecretV2 = async (
    { status, limit = 20, offset = 0, projectId, committer, environment, userId, search }: TFindQueryFilter,
    tx?: Knex
  ) => {
    try {
      // akhilmhdh: If ever u wanted a 1 to so many relationship connected with pagination
      // this is the place u wanna look at.
      const innerQuery = (tx || db.replicaNode())(TableName.SecretApprovalRequest)
        .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalRequest}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        .leftJoin(
          TableName.SecretApprovalPolicyApprover,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalPolicyApprover}.policyId`
        )
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.SecretApprovalPolicyApprover}.approverGroupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .leftJoin(
          TableName.SecretApprovalPolicyBypasser,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalPolicyBypasser}.policyId`
        )
        .leftJoin<TUserGroupMembership>(
          db(TableName.UserGroupMembership).as("bypasserUserGroupMembership"),
          `${TableName.SecretApprovalPolicyBypasser}.bypasserGroupId`,
          `bypasserUserGroupMembership.groupId`
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
              .orWhere(`${TableName.UserGroupMembership}.userId`, userId)
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
            `DENSE_RANK() OVER (PARTITION BY ${TableName.Environment}."projectId" ORDER BY ${TableName.SecretApprovalRequest}."createdAt" DESC) as rank`
          ),
          db.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
          db.ref("allowedSelfApprovals").withSchema(TableName.SecretApprovalPolicy).as("policyAllowedSelfApprovals"),
          db.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"),
          db.ref("enforcementLevel").withSchema(TableName.SecretApprovalPolicy).as("policyEnforcementLevel"),
          db.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover),
          db.ref("userId").withSchema(TableName.UserGroupMembership).as("approverGroupUserId"),

          // Bypasser
          db.ref("bypasserUserId").withSchema(TableName.SecretApprovalPolicyBypasser),
          db.ref("userId").withSchema("bypasserUserGroupMembership").as("bypasserGroupUserId"),

          db.ref("email").withSchema("committerUser").as("committerUserEmail"),
          db.ref("username").withSchema("committerUser").as("committerUserUsername"),
          db.ref("firstName").withSchema("committerUser").as("committerUserFirstName"),
          db.ref("lastName").withSchema("committerUser").as("committerUserLastName")
        )
        .distinctOn(`${TableName.SecretApprovalRequest}.id`)
        .as("inner");

      const query = (tx || db)
        .select("*")
        .select(db.raw("count(*) OVER() as total_count"))
        .from(innerQuery)
        .orderBy("createdAt", "desc") as typeof innerQuery;

      if (search) {
        void query.where((qb) => {
          void qb
            .whereRaw(`CONCAT_WS(' ', ??, ??) ilike ?`, [
              db.ref("firstName").withSchema("committerUser"),
              db.ref("lastName").withSchema("committerUser"),
              `%${search}%`
            ])
            .orWhereRaw(`?? ilike ?`, [db.ref("username").withSchema("committerUser"), `%${search}%`])
            .orWhereRaw(`?? ilike ?`, [db.ref("email").withSchema("committerUser"), `%${search}%`])
            .orWhereILike(`${TableName.Environment}.name`, `%${search}%`)
            .orWhereILike(`${TableName.Environment}.slug`, `%${search}%`)
            .orWhereILike(`${TableName.SecretApprovalPolicy}.secretPath`, `%${search}%`);
        });
      }

      const rankOffset = offset + 1;
      const docs = await (tx || db)
        .with("w", query)
        .select("*")
        .from<Awaited<typeof query>[number]>("w")
        .where("w.rank", ">=", rankOffset)
        .andWhere("w.rank", "<", rankOffset + limit);

      // @ts-expect-error knex does not infer
      const totalCount = Number(docs[0]?.total_count || 0);

      const formattedDoc = sqlNestRelationships({
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
            enforcementLevel: el.policyEnforcementLevel,
            allowedSelfApprovals: el.policyAllowedSelfApprovals
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
            mapper: ({ approverUserId }) => ({ userId: approverUserId })
          },
          {
            key: "commitId",
            label: "commits" as const,
            mapper: ({ commitSecretId: secretId, commitId: id, commitOp: op }) => ({
              op,
              id,
              secretId
            })
          },
          {
            key: "approverGroupUserId",
            label: "approvers" as const,
            mapper: ({ approverGroupUserId }) => ({
              userId: approverGroupUserId
            })
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserUserId }) => ({ userId: bypasserUserId })
          },
          {
            key: "bypasserGroupUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserGroupUserId }) => ({
              userId: bypasserGroupUserId
            })
          }
        ]
      });
      return {
        approvals: formattedDoc.map((el) => ({
          ...el,
          policy: { ...el.policy, approvers: el.approvers, bypassers: el.bypassers }
        })),
        totalCount
      };
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
