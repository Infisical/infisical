import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  SecretApprovalRequestsSchema,
  TableName,
  TMemberships,
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
  userId?: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
  search?: string;
};

// Helper to filter approval requests by user access (committer, approver, or group member)
// Only applies filtering when userId is provided (users without SecretApprovalRequest.Read permission)
const buildUserAccessFilter = (qb: Knex.QueryBuilder, userId?: string) => {
  if (userId) {
    void qb.andWhere(
      (bd) =>
        void bd
          .where(`${TableName.SecretApprovalPolicyApprover}.approverUserId`, userId)
          .orWhere(`${TableName.SecretApprovalRequest}.committerUserId`, userId)
          .orWhere(`${TableName.UserGroupMembership}.userId`, userId)
    );
  }
};

export const secretApprovalRequestDALFactory = (db: TDbClient) => {
  const secretApprovalRequestOrm = ormify(db, TableName.SecretApprovalRequest);

  const findQuery = (filter: TFindFilter<TSecretApprovalRequests>, tx: Knex) =>
    tx(TableName.SecretApprovalRequest)
      .where(filter)
      .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .join(
        TableName.SecretApprovalPolicy,
        `${TableName.SecretApprovalRequest}.policyId`,
        `${TableName.SecretApprovalPolicy}.id`
      )
      .leftJoin(TableName.SecretApprovalPolicyEnvironment, (bd) => {
        bd.on(
          `${TableName.SecretApprovalPolicy}.id`,
          "=",
          `${TableName.SecretApprovalPolicyEnvironment}.policyId`
        ).andOn(`${TableName.SecretApprovalPolicyEnvironment}.envId`, "=", `${TableName.SecretFolder}.envId`);
      })
      .leftJoin<TUsers>(
        db(TableName.Users).as("statusChangedByUser"),
        `${TableName.SecretApprovalRequest}.statusChangedByUserId`,
        `statusChangedByUser.id`
      )
      .leftJoin<TUsers>(
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

      .leftJoin<TMemberships>(db(TableName.Membership).as("approverOrgMembership"), (qb) => {
        qb.on(`${TableName.SecretApprovalPolicyApprover}.approverUserId`, `approverOrgMembership.actorUserId`)
          .andOn(`approverOrgMembership.scopeOrgId`, `${TableName.Project}.orgId`)
          .andOn(`approverOrgMembership.scope`, db.raw("?", [AccessScope.Organization]));
      })

      .leftJoin<TMemberships>(db(TableName.Membership).as("approverGroupOrgMembership"), (qb) => {
        qb.on(`secretApprovalPolicyGroupApproverUser.id`, `approverGroupOrgMembership.actorUserId`)
          .andOn(`approverGroupOrgMembership.scopeOrgId`, `${TableName.Project}.orgId`)
          .andOn(`approverGroupOrgMembership.scope`, db.raw("?", [AccessScope.Organization]));
      })
      .leftJoin<TMemberships>(db(TableName.Membership).as("reviewerOrgMembership"), (qb) => {
        qb.on(`${TableName.SecretApprovalRequestReviewer}.reviewerUserId`, `reviewerOrgMembership.actorUserId`)
          .andOn(`reviewerOrgMembership.scopeOrgId`, `${TableName.Project}.orgId`)
          .andOn(`reviewerOrgMembership.scope`, db.raw("?", [AccessScope.Organization]));
      })
      .select(selectAllTableCols(TableName.SecretApprovalRequest))
      .select(
        tx.ref("approverUserId").withSchema(TableName.SecretApprovalPolicyApprover),
        tx.ref("userId").withSchema("approverUserGroupMembership").as("approverGroupUserId"),
        tx.ref("email").withSchema("secretApprovalPolicyApproverUser").as("approverEmail"),
        tx.ref("isActive").withSchema("approverOrgMembership").as("approverIsOrgMembershipActive"),
        tx.ref("isActive").withSchema("approverGroupOrgMembership").as("approverGroupIsOrgMembershipActive"),
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
        tx.ref("createdAt").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerCreatedAt"),
        tx.ref("email").withSchema("secretApprovalReviewerUser").as("reviewerEmail"),
        tx.ref("username").withSchema("secretApprovalReviewerUser").as("reviewerUsername"),
        tx.ref("firstName").withSchema("secretApprovalReviewerUser").as("reviewerFirstName"),
        tx.ref("lastName").withSchema("secretApprovalReviewerUser").as("reviewerLastName"),
        tx.ref("isActive").withSchema("reviewerOrgMembership").as("reviewerIsOrgMembershipActive"),
        tx.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"),
        tx.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"),
        tx.ref("projectId").withSchema(TableName.Environment),
        tx.ref("slug").withSchema(TableName.Environment).as("environment"),
        tx.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
        tx.ref("envId").withSchema(TableName.SecretApprovalPolicyEnvironment).as("policyEnvId"),
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
          committerUser: el.committerUserId
            ? {
                userId: el.committerUserId,
                email: el.committerUserEmail,
                firstName: el.committerUserFirstName,
                lastName: el.committerUserLastName,
                username: el.committerUserUsername
              }
            : null,
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
              reviewerComment: comment,
              reviewerCreatedAt: createdAt,
              reviewerIsOrgMembershipActive: isOrgMembershipActive
            }) =>
              userId
                ? {
                    userId,
                    status,
                    email,
                    firstName,
                    lastName,
                    username,
                    comment: comment ?? "",
                    createdAt,
                    isOrgMembershipActive
                  }
                : undefined
          },
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({
              approverUserId: userId,
              approverEmail: email,
              approverUsername: username,
              approverLastName: lastName,
              approverFirstName: firstName,
              approverIsOrgMembershipActive: isOrgMembershipActive
            }) => ({
              userId,
              email,
              firstName,
              lastName,
              username,
              isOrgMembershipActive
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
              approverGroupFirstName: firstName,
              approverGroupIsOrgMembershipActive: isOrgMembershipActive
            }) => ({
              userId,
              email,
              firstName,
              lastName,
              username,
              isOrgMembershipActive
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

  const findProjectRequestCount = async (projectId: string, userId?: string, policyId?: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())
        .with(
          "temp",
          (tx || db.replicaNode())(TableName.SecretApprovalRequest)
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
            .where({ projectId })
            .where((qb) => {
              if (policyId) void qb.where(`${TableName.SecretApprovalPolicy}.id`, policyId);
            })
            .modify((qb) => buildUserAccessFilter(qb, userId))
            .select("status", `${TableName.SecretApprovalRequest}.id`)
            .groupBy(`${TableName.SecretApprovalRequest}.id`, "status")
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
        .leftJoin<TUsers>(
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
        .modify((qb) => buildUserAccessFilter(qb, userId))
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

      const query = (tx || db.replicaNode())
        .select("*")
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const countResult = await (tx || db.replicaNode())
        .count({ count: "*" })
        .from(query.clone().as("count_query"))
        .first();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const totalCount = Number(countResult?.count || 0);

      const docs = await (tx || db)
        .with("w", query)
        .select("*")
        .from<Awaited<typeof query>[number]>("w")
        .where("w.rank", ">=", offset)
        .andWhere("w.rank", "<", offset + limit);

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
          committerUser: el.committerUserId
            ? {
                userId: el.committerUserId,
                email: el.committerUserEmail,
                firstName: el.committerUserFirstName,
                lastName: el.committerUserLastName,
                username: el.committerUserUsername
              }
            : null
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
        .leftJoin<TUsers>(
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
        .modify((qb) => buildUserAccessFilter(qb, userId))
        .select(selectAllTableCols(TableName.SecretApprovalRequest))
        .select(
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("name").withSchema(TableName.Environment).as("environmentName"),
          db.ref("name").withSchema(TableName.SecretFolder).as("requestFolderPath"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerId"),
          db.ref("reviewerUserId").withSchema(TableName.SecretApprovalRequestReviewer),
          db.ref("status").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerStatus"),
          db.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"),
          db.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"),
          db.ref("op").withSchema(TableName.SecretApprovalRequestSecretV2).as("commitOp"),
          db.ref("secretId").withSchema(TableName.SecretApprovalRequestSecretV2).as("commitSecretId"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecretV2).as("commitId"),
          db.ref("key").withSchema(TableName.SecretApprovalRequestSecretV2).as("secretKey"),
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
        .as("inner");

      const query = (tx || db).select("*").from(innerQuery).orderBy("createdAt", "desc") as typeof innerQuery;

      if (search) {
        void query.where((qb) => {
          void qb
            .whereRaw(`CONCAT_WS(' ', ??, ??) ilike ?`, [
              db.ref("committerUserFirstName"),
              db.ref("committerUserLastName"),
              `%${search}%`
            ])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerUserUsername"), `%${search}%`])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerUserEmail"), `%${search}%`])
            .orWhereILike(`environmentName`, `%${search}%`)
            .orWhereILike(`environment`, `%${search}%`)
            .orWhereILike(`policySecretPath`, `%${search}%`)
            .orWhereILike(`requestFolderPath`, `%${search}%`)
            .orWhereILike(`secretKey`, `%${search}%`);
        });
      }

      // Phase 1: Get page of change request ids (one row per request) + total count
      // Use createdAt DESC, id so DENSE_RANK is deterministic (no ties => exactly `limit` rows per page)
      const rankOffset = offset + 1;
      const distinctRequestsSub = query
        .clone()
        .clearSelect()
        .clearOrder()
        .select(db.raw('DISTINCT ON (id) id, "createdAt"'))
        .orderBy("id")
        .orderBy("createdAt", "desc");
      const rankedSub = (tx || db)
        .select(
          db.raw('id, "createdAt", DENSE_RANK() OVER (ORDER BY "createdAt" DESC, id) as r, COUNT(*) OVER () as total')
        )
        .from(distinctRequestsSub.as("dr"));
      const pageIdsResult = (await (tx || db)
        .select("id", "r", "total")
        .from(rankedSub.as("ranked"))
        .where("r", ">=", rankOffset)
        .where("r", "<", rankOffset + limit)
        .orderBy("r", "asc")
        .limit(limit)) as Array<{ id: string; r: number; total: string }>;

      const pageIds = pageIdsResult.map((row) => row.id).slice(0, limit);
      let totalCount = pageIdsResult.length > 0 ? Number(pageIdsResult[0]?.total ?? 0) : 0;

      if (pageIdsResult.length === 0) {
        const countResult = (await (tx || db)
          .select(db.raw("COUNT(DISTINCT id) as total_count"))
          .from(query.clone().as("count_query"))
          .first()) as { total_count: string } | undefined;
        totalCount = Number(countResult?.total_count ?? 0);
      }

      // Phase 2: Full data for this page's request ids (all commit rows for display)
      const docs =
        pageIds.length === 0
          ? []
          : ((await (tx || db)
              .select("*")
              .from(innerQuery)
              .whereIn(`id`, pageIds)
              .orderBy("createdAt", "desc")) as Awaited<typeof query>[number][]);

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
          committerUser: el.committerUserId
            ? {
                userId: el.committerUserId,
                email: el.committerUserEmail,
                firstName: el.committerUserFirstName,
                lastName: el.committerUserLastName,
                username: el.committerUserUsername
              }
            : null
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
      const capped = formattedDoc.slice(0, limit);
      const approvals = capped.map((el) => ({
        ...el,
        policy: { ...el.policy, approvers: el.approvers, bypassers: el.bypassers }
      }));
      return { approvals, totalCount };
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
