import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessApprovalRequestsSchema, TAccessApprovalRequests } from "@app/db/schemas/access-approval-requests";
import { TMemberships } from "@app/db/schemas/memberships";
import { AccessScope, TableName } from "@app/db/schemas/models";
import { TUserGroupMembership } from "@app/db/schemas/user-group-membership";
import { TUsers } from "@app/db/schemas/users";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships, TFindFilter, TOrmify } from "@app/lib/knex";

import { ApprovalStatus } from "./access-approval-request-types";

export interface TAccessApprovalRequestDALFactory extends Omit<TOrmify<TableName.AccessApprovalRequest>, "findById"> {
  findById: (
    id: string,
    tx?: Knex
  ) => Promise<
    | {
        policy: {
          approvers: (
            | {
                userId: string | null | undefined;
                email: string | null | undefined;
                firstName: string | null | undefined;
                lastName: string | null | undefined;
                username: string;
                sequence: number | null | undefined;
                approvalsRequired: number | null | undefined;
              }
            | {
                userId: string;
                email: string | null | undefined;
                firstName: string | null | undefined;
                lastName: string | null | undefined;
                username: string;
                sequence: number | null | undefined;
                approvalsRequired: number | null | undefined;
              }
          )[];
          bypassers: (
            | {
                userId: string | null | undefined;
                email: string | null | undefined;
                firstName: string | null | undefined;
                lastName: string | null | undefined;
                username: string;
              }
            | {
                userId: string;
                email: string | null | undefined;
                firstName: string | null | undefined;
                lastName: string | null | undefined;
                username: string;
              }
          )[];
          id: string;
          name: string;
          approvals: number;
          secretPath: string | null | undefined;
          enforcementLevel: string;
          allowedSelfApprovals: boolean;
          deletedAt: Date | null | undefined;
          maxTimePeriod?: string | null;
        };
        projectId: string;
        environments: string[];
        requestedByUser: {
          userId: string;
          email: string | null | undefined;
          firstName: string | null | undefined;
          lastName: string | null | undefined;
          username: string;
        };
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        policyId: string;
        isTemporary: boolean;
        requestedByUserId: string;
        privilegeId?: string | null | undefined;
        requestedBy?: string | null | undefined;
        temporaryRange?: string | null | undefined;
        permissions?: unknown;
        note?: string | null | undefined;
        privilegeDeletedAt?: Date | null | undefined;
        reviewers: {
          userId: string;
          status: string;
          email: string | null | undefined;
          firstName: string | null | undefined;
          lastName: string | null | undefined;
          username: string;
        }[];
        approvers: (
          | {
              userId: string | null | undefined;
              email: string | null | undefined;
              firstName: string | null | undefined;
              lastName: string | null | undefined;
              username: string;
              sequence: number | null | undefined;
              approvalsRequired: number | null | undefined;
            }
          | {
              userId: string;
              email: string | null | undefined;
              firstName: string | null | undefined;
              lastName: string | null | undefined;
              username: string;
              sequence: number | null | undefined;
              approvalsRequired: number | null | undefined;
            }
        )[];
        bypassers: (
          | {
              userId: string | null | undefined;
              email: string | null | undefined;
              firstName: string | null | undefined;
              lastName: string | null | undefined;
              username: string;
            }
          | {
              userId: string;
              email: string | null | undefined;
              firstName: string | null | undefined;
              lastName: string | null | undefined;
              username: string;
            }
        )[];
      }
    | undefined
  >;
  findRequestsWithPrivilegeByPolicyIds: (policyIds: string[]) => Promise<
    {
      policy: {
        approvers: (
          | {
              userId: string | null | undefined;
              sequence: number | null | undefined;
              approvalsRequired: number | null | undefined;
              email: string | null | undefined;
              username: string;
              isOrgMembershipActive: boolean;
            }
          | {
              userId: string;
              sequence: number | null | undefined;
              approvalsRequired: number | null | undefined;
              email: string | null | undefined;
              username: string;
              isOrgMembershipActive: boolean;
            }
        )[];
        bypassers: string[];
        id: string;
        name: string;
        approvals: number;
        secretPath: string | null | undefined;
        enforcementLevel: string;
        allowedSelfApprovals: boolean;
        envId: string;
        deletedAt: Date | null | undefined;
        maxTimePeriod?: string | null;
      };
      projectId: string;
      environment: string;
      environmentName: string;
      requestedByUser: {
        userId: string;
        email: string | null | undefined;
        firstName: string | null | undefined;
        lastName: string | null | undefined;
        username: string;
      };
      privilege: {
        membershipId: string;
        userId: string;
        projectId: string;
        isTemporary: boolean;
        temporaryMode: string | null | undefined;
        temporaryRange: string | null | undefined;
        temporaryAccessStartTime: Date | null | undefined;
        temporaryAccessEndTime: Date | null | undefined;
        permissions: unknown;
      } | null;
      isApproved: boolean;
      status: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      policyId: string;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      requestedBy?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      privilegeDeletedAt?: Date | null | undefined;
      reviewers: {
        userId: string;
        status: string;
        isOrgMembershipActive: boolean;
      }[];
      approvers: (
        | {
            userId: string | null | undefined;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
            email: string | null | undefined;
            username: string;
            isOrgMembershipActive: boolean;
          }
        | {
            userId: string;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
            email: string | null | undefined;
            username: string;
            isOrgMembershipActive: boolean;
          }
      )[];
      bypassers: string[];
    }[]
  >;
  getCount: ({ projectId }: { projectId: string; policyId?: string }) => Promise<{
    pendingCount: number;
    finalizedCount: number;
  }>;
  resetReviewByPolicyId: (policyId: string, tx?: Knex) => Promise<void>;
}

export const accessApprovalRequestDALFactory = (db: TDbClient): TAccessApprovalRequestDALFactory => {
  const accessApprovalRequestOrm = ormify(db, TableName.AccessApprovalRequest);

  const findRequestsWithPrivilegeByPolicyIds: TAccessApprovalRequestDALFactory["findRequestsWithPrivilegeByPolicyIds"] =
    async (policyIds) => {
      try {
        const docs = await db
          .replicaNode()(TableName.AccessApprovalRequest)
          .whereIn(`${TableName.AccessApprovalRequest}.policyId`, policyIds)
          .leftJoin(
            TableName.AdditionalPrivilege,
            `${TableName.AccessApprovalRequest}.privilegeId`,
            `${TableName.AdditionalPrivilege}.id`
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
          .leftJoin<TUsers>(
            db(TableName.Users).as("accessApprovalPolicyApproverUser"),
            `${TableName.AccessApprovalPolicyApprover}.approverUserId`,
            "accessApprovalPolicyApproverUser.id"
          )
          .leftJoin(
            TableName.UserGroupMembership,
            `${TableName.AccessApprovalPolicyApprover}.approverGroupId`,
            `${TableName.UserGroupMembership}.groupId`
          )
          .leftJoin(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
          .leftJoin(
            TableName.AccessApprovalPolicyBypasser,
            `${TableName.AccessApprovalPolicy}.id`,
            `${TableName.AccessApprovalPolicyBypasser}.policyId`
          )
          .leftJoin<TUserGroupMembership>(
            db(TableName.UserGroupMembership).as("bypasserUserGroupMembership"),
            `${TableName.AccessApprovalPolicyBypasser}.bypasserGroupId`,
            `bypasserUserGroupMembership.groupId`
          )

          .join<TUsers>(
            db(TableName.Users).as("requestedByUser"),
            `${TableName.AccessApprovalRequest}.requestedByUserId`,
            `requestedByUser.id`
          )

          .leftJoin<TMemberships>(db(TableName.Membership).as("approverOrgMembership"), (qb) => {
            qb.on(
              `${TableName.AccessApprovalPolicyApprover}.approverUserId`,
              `approverOrgMembership.actorUserId`
            ).andOn(`approverOrgMembership.scope`, db.raw("?", [AccessScope.Organization]));
          })
          .leftJoin<TMemberships>(db(TableName.Membership).as("approverGroupOrgMembership"), (qb) => {
            qb.on(`${TableName.Users}.id`, `approverGroupOrgMembership.actorUserId`).andOn(
              `approverGroupOrgMembership.scope`,
              db.raw("?", [AccessScope.Organization])
            );
          })
          .leftJoin<TMemberships>(db(TableName.Membership).as("reviewerOrgMembership"), (qb) => {
            qb.on(
              `${TableName.AccessApprovalRequestReviewer}.reviewerUserId`,
              `reviewerOrgMembership.actorUserId`
            ).andOn(`reviewerOrgMembership.scope`, db.raw("?", [AccessScope.Organization]));
          })
          .leftJoin(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)

          .select(selectAllTableCols(TableName.AccessApprovalRequest))
          .select(
            db.ref("id").withSchema(TableName.AccessApprovalPolicy).as("policyId"),
            db.ref("name").withSchema(TableName.AccessApprovalPolicy).as("policyName"),
            db.ref("approvals").withSchema(TableName.AccessApprovalPolicy).as("policyApprovals"),
            db.ref("secretPath").withSchema(TableName.AccessApprovalPolicy).as("policySecretPath"),
            db.ref("enforcementLevel").withSchema(TableName.AccessApprovalPolicy).as("policyEnforcementLevel"),
            db.ref("allowedSelfApprovals").withSchema(TableName.AccessApprovalPolicy).as("policyAllowedSelfApprovals"),
            db.ref("envId").withSchema(TableName.AccessApprovalPolicy).as("policyEnvId"),
            db.ref("deletedAt").withSchema(TableName.AccessApprovalPolicy).as("policyDeletedAt"),

            db.ref("isActive").withSchema("approverOrgMembership").as("approverIsOrgMembershipActive"),
            db.ref("isActive").withSchema("approverGroupOrgMembership").as("approverGroupIsOrgMembershipActive"),
            db.ref("isActive").withSchema("reviewerOrgMembership").as("reviewerIsOrgMembershipActive"),
            db.ref("maxTimePeriod").withSchema(TableName.AccessApprovalPolicy).as("policyMaxTimePeriod")
          )
          .select(db.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover))
          .select(db.ref("sequence").withSchema(TableName.AccessApprovalPolicyApprover).as("approverSequence"))
          .select(db.ref("approvalsRequired").withSchema(TableName.AccessApprovalPolicyApprover))
          .select(db.ref("userId").withSchema(TableName.UserGroupMembership).as("approverGroupUserId"))
          .select(db.ref("bypasserUserId").withSchema(TableName.AccessApprovalPolicyBypasser))
          .select(db.ref("userId").withSchema("bypasserUserGroupMembership").as("bypasserGroupUserId"))
          .select(
            db.ref("email").withSchema("accessApprovalPolicyApproverUser").as("approverEmail"),
            db.ref("email").withSchema(TableName.Users).as("approverGroupEmail"),
            db.ref("username").withSchema("accessApprovalPolicyApproverUser").as("approverUsername"),
            db.ref("username").withSchema(TableName.Users).as("approverGroupUsername")
          )
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

            db.ref("actorUserId").withSchema(TableName.AdditionalPrivilege).as("privilegeUserId"),
            db.ref("projectId").withSchema(TableName.AdditionalPrivilege).as("privilegeMembershipId"),

            db.ref("isTemporary").withSchema(TableName.AdditionalPrivilege).as("privilegeIsTemporary"),
            db.ref("temporaryMode").withSchema(TableName.AdditionalPrivilege).as("privilegeTemporaryMode"),
            db.ref("temporaryRange").withSchema(TableName.AdditionalPrivilege).as("privilegeTemporaryRange"),
            db
              .ref("temporaryAccessStartTime")
              .withSchema(TableName.AdditionalPrivilege)
              .as("privilegeTemporaryAccessStartTime"),
            db
              .ref("temporaryAccessEndTime")
              .withSchema(TableName.AdditionalPrivilege)
              .as("privilegeTemporaryAccessEndTime"),

            db.ref("permissions").withSchema(TableName.AdditionalPrivilege).as("privilegePermissions")
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
              allowedSelfApprovals: doc.policyAllowedSelfApprovals,
              envId: doc.policyEnvId,
              deletedAt: doc.policyDeletedAt,
              maxTimePeriod: doc.policyMaxTimePeriod
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
                  userId: doc.privilegeUserId || "",
                  projectId: doc.projectId,
                  isTemporary: doc.privilegeIsTemporary,
                  temporaryMode: doc.privilegeTemporaryMode,
                  temporaryRange: doc.privilegeTemporaryRange,
                  temporaryAccessStartTime: doc.privilegeTemporaryAccessStartTime,
                  temporaryAccessEndTime: doc.privilegeTemporaryAccessEndTime,
                  permissions: doc.privilegePermissions
                }
              : null,
            isApproved: doc.status === ApprovalStatus.APPROVED
          }),
          childrenMapper: [
            {
              key: "reviewerUserId",
              label: "reviewers" as const,
              mapper: ({ reviewerUserId: userId, reviewerStatus: status, reviewerIsOrgMembershipActive }) =>
                userId ? { userId, status, isOrgMembershipActive: reviewerIsOrgMembershipActive } : undefined
            },
            {
              key: "approverUserId",
              label: "approvers" as const,
              mapper: ({
                approverUserId,
                approverSequence,
                approvalsRequired,
                approverUsername,
                approverEmail,
                approverIsOrgMembershipActive
              }) => ({
                userId: approverUserId,
                sequence: approverSequence,
                approvalsRequired,
                email: approverEmail,
                username: approverUsername,
                isOrgMembershipActive: approverIsOrgMembershipActive
              })
            },
            {
              key: "approverGroupUserId",
              label: "approvers" as const,
              mapper: ({
                approverGroupUserId,
                approverSequence,
                approvalsRequired,
                approverGroupEmail,
                approverGroupUsername,
                approverGroupIsOrgMembershipActive
              }) => ({
                userId: approverGroupUserId,
                sequence: approverSequence,
                approvalsRequired,
                email: approverGroupEmail,
                username: approverGroupUsername,
                isOrgMembershipActive: approverGroupIsOrgMembershipActive
              })
            },
            { key: "bypasserUserId", label: "bypassers" as const, mapper: ({ bypasserUserId }) => bypasserUserId },
            {
              key: "bypasserGroupUserId",
              label: "bypassers" as const,
              mapper: ({ bypasserGroupUserId }) => bypasserGroupUserId
            }
          ]
        });

        if (!formattedDocs) return [];

        return formattedDocs.map((doc) => ({
          ...doc,
          policy: {
            ...doc.policy,
            approvers: doc.approvers.filter((el) => el.userId).sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
            bypassers: doc.bypassers
          }
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

      .leftJoin(
        TableName.AccessApprovalPolicyApprover,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyApprover}.policyId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("accessApprovalPolicyApproverUser"),
        `${TableName.AccessApprovalPolicyApprover}.approverUserId`,
        "accessApprovalPolicyApproverUser.id"
      )
      .leftJoin(
        TableName.UserGroupMembership,
        `${TableName.AccessApprovalPolicyApprover}.approverGroupId`,
        `${TableName.UserGroupMembership}.groupId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("accessApprovalPolicyGroupApproverUser"),
        `${TableName.UserGroupMembership}.userId`,
        "accessApprovalPolicyGroupApproverUser.id"
      )

      .leftJoin(
        TableName.AccessApprovalPolicyBypasser,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyBypasser}.policyId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("accessApprovalPolicyBypasserUser"),
        `${TableName.AccessApprovalPolicyBypasser}.bypasserUserId`,
        "accessApprovalPolicyBypasserUser.id"
      )
      .leftJoin<TUserGroupMembership>(
        db(TableName.UserGroupMembership).as("bypasserUserGroupMembership"),
        `${TableName.AccessApprovalPolicyBypasser}.bypasserGroupId`,
        `bypasserUserGroupMembership.groupId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("accessApprovalPolicyGroupBypasserUser"),
        `bypasserUserGroupMembership.userId`,
        "accessApprovalPolicyGroupBypasserUser.id"
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

      .leftJoin(
        TableName.AccessApprovalPolicyEnvironment,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyEnvironment}.policyId`
      )

      .leftJoin(
        TableName.Environment,
        `${TableName.AccessApprovalPolicyEnvironment}.envId`,
        `${TableName.Environment}.id`
      )
      .select(selectAllTableCols(TableName.AccessApprovalRequest))
      .select(
        tx.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover),
        tx.ref("sequence").withSchema(TableName.AccessApprovalPolicyApprover).as("approverSequence"),
        tx.ref("approvalsRequired").withSchema(TableName.AccessApprovalPolicyApprover),
        tx.ref("userId").withSchema(TableName.UserGroupMembership),
        tx.ref("email").withSchema("accessApprovalPolicyApproverUser").as("approverEmail"),
        tx.ref("email").withSchema("accessApprovalPolicyGroupApproverUser").as("approverGroupEmail"),
        tx.ref("username").withSchema("accessApprovalPolicyApproverUser").as("approverUsername"),
        tx.ref("username").withSchema("accessApprovalPolicyGroupApproverUser").as("approverGroupUsername"),
        tx.ref("firstName").withSchema("accessApprovalPolicyApproverUser").as("approverFirstName"),
        tx.ref("firstName").withSchema("accessApprovalPolicyGroupApproverUser").as("approverGroupFirstName"),
        tx.ref("lastName").withSchema("accessApprovalPolicyApproverUser").as("approverLastName"),
        tx.ref("lastName").withSchema("accessApprovalPolicyGroupApproverUser").as("approverGroupLastName"),
        tx.ref("email").withSchema("requestedByUser").as("requestedByUserEmail"),
        tx.ref("username").withSchema("requestedByUser").as("requestedByUserUsername"),
        tx.ref("firstName").withSchema("requestedByUser").as("requestedByUserFirstName"),
        tx.ref("lastName").withSchema("requestedByUser").as("requestedByUserLastName"),

        // Bypassers
        tx.ref("bypasserUserId").withSchema(TableName.AccessApprovalPolicyBypasser),
        tx.ref("userId").withSchema("bypasserUserGroupMembership").as("bypasserGroupUserId"),
        tx.ref("email").withSchema("accessApprovalPolicyBypasserUser").as("bypasserEmail"),
        tx.ref("email").withSchema("accessApprovalPolicyGroupBypasserUser").as("bypasserGroupEmail"),
        tx.ref("username").withSchema("accessApprovalPolicyBypasserUser").as("bypasserUsername"),
        tx.ref("username").withSchema("accessApprovalPolicyGroupBypasserUser").as("bypasserGroupUsername"),
        tx.ref("firstName").withSchema("accessApprovalPolicyBypasserUser").as("bypasserFirstName"),
        tx.ref("firstName").withSchema("accessApprovalPolicyGroupBypasserUser").as("bypasserGroupFirstName"),
        tx.ref("lastName").withSchema("accessApprovalPolicyBypasserUser").as("bypasserLastName"),
        tx.ref("lastName").withSchema("accessApprovalPolicyGroupBypasserUser").as("bypasserGroupLastName"),

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
        tx.ref("allowedSelfApprovals").withSchema(TableName.AccessApprovalPolicy).as("policyAllowedSelfApprovals"),
        tx.ref("approvals").withSchema(TableName.AccessApprovalPolicy).as("policyApprovals"),
        tx.ref("deletedAt").withSchema(TableName.AccessApprovalPolicy).as("policyDeletedAt"),
        tx.ref("maxTimePeriod").withSchema(TableName.AccessApprovalPolicy).as("policyMaxTimePeriod")
      );

  const findById: TAccessApprovalRequestDALFactory["findById"] = async (id, tx) => {
    try {
      const sql = findQuery({ [`${TableName.AccessApprovalRequest}.id` as "id"]: id }, tx || db.replicaNode());
      const docs = await sql;
      const formattedDoc = sqlNestRelationships({
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
            enforcementLevel: el.policyEnforcementLevel,
            allowedSelfApprovals: el.policyAllowedSelfApprovals,
            deletedAt: el.policyDeletedAt,
            maxTimePeriod: el.policyMaxTimePeriod
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
              approverFirstName: firstName,
              approverSequence,
              approvalsRequired
            }) => ({
              userId: approverUserId,
              email,
              firstName,
              lastName,
              username,
              sequence: approverSequence,
              approvalsRequired
            })
          },
          {
            key: "userId",
            label: "approvers" as const,
            mapper: ({
              userId,
              approverGroupEmail: email,
              approverGroupUsername: username,
              approverGroupLastName: lastName,
              approverFirstName: firstName,
              approverSequence,
              approvalsRequired
            }) => ({
              userId,
              email,
              firstName,
              lastName,
              username,
              sequence: approverSequence,
              approvalsRequired
            })
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({
              bypasserUserId,
              bypasserEmail: email,
              bypasserUsername: username,
              bypasserLastName: lastName,
              bypasserFirstName: firstName
            }) => ({
              userId: bypasserUserId,
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
              userId,
              bypasserGroupEmail: email,
              bypasserGroupUsername: username,
              bypasserGroupLastName: lastName,
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
            key: "environment",
            label: "environments" as const,
            mapper: ({ environment }) => environment
          }
        ]
      });
      if (!formattedDoc?.[0]) return;
      return {
        ...formattedDoc[0],
        policy: {
          ...formattedDoc[0].policy,
          approvers: formattedDoc[0].approvers
            .filter((el) => el.userId)
            .sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
          bypassers: formattedDoc[0].bypassers
        }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdAccessApprovalRequest" });
    }
  };

  const getCount: TAccessApprovalRequestDALFactory["getCount"] = async ({ projectId, policyId }) => {
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
          TableName.AdditionalPrivilege,
          `${TableName.AccessApprovalRequest}.privilegeId`,
          `${TableName.AdditionalPrivilege}.id`
        )

        .leftJoin(
          TableName.AccessApprovalRequestReviewer,
          `${TableName.AccessApprovalRequest}.id`,
          `${TableName.AccessApprovalRequestReviewer}.requestId`
        )
        .where(`${TableName.Environment}.projectId`, projectId)
        .where((qb) => {
          if (policyId) void qb.where(`${TableName.AccessApprovalPolicy}.id`, policyId);
        })
        .select(selectAllTableCols(TableName.AccessApprovalRequest))
        .select(db.ref("status").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerStatus"))
        .select(db.ref("reviewerUserId").withSchema(TableName.AccessApprovalRequestReviewer).as("reviewerUserId"))
        .select(db.ref("deletedAt").withSchema(TableName.AccessApprovalPolicy).as("policyDeletedAt"));

      const formattedRequests = sqlNestRelationships({
        data: accessRequests,
        key: "id",
        parentMapper: (doc) => ({
          ...AccessApprovalRequestsSchema.parse(doc),
          isPolicyDeleted: Boolean(doc.policyDeletedAt)
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

      // an approval is pending if there is no reviewer rejections, no privilege ID is set and the status is pending
      const pendingApprovals = formattedRequests.filter(
        (req) =>
          !req.privilegeId &&
          !req.reviewers.some((r) => r.status === ApprovalStatus.REJECTED) &&
          req.status === ApprovalStatus.PENDING &&
          !req.isPolicyDeleted
      );

      // an approval is finalized if there are any rejections, a privilege ID is set or the number of approvals is equal to the number of approvals required.
      const finalizedApprovals = formattedRequests.filter(
        (req) =>
          req.privilegeId ||
          req.reviewers.some((r) => r.status === ApprovalStatus.REJECTED) ||
          req.status !== ApprovalStatus.PENDING ||
          req.isPolicyDeleted
      );

      return { pendingCount: pendingApprovals.length, finalizedCount: finalizedApprovals.length };
    } catch (error) {
      throw new DatabaseError({ error, name: "GetCountAccessApprovalRequest" });
    }
  };

  const resetReviewByPolicyId: TAccessApprovalRequestDALFactory["resetReviewByPolicyId"] = async (policyId, tx) => {
    try {
      await (tx || db)(TableName.AccessApprovalRequestReviewer)
        .leftJoin(
          TableName.AccessApprovalRequest,
          `${TableName.AccessApprovalRequest}.id`,
          `${TableName.AccessApprovalRequestReviewer}.requestId`
        )
        .where(`${TableName.AccessApprovalRequest}.status` as "status", ApprovalStatus.PENDING)
        .where(`${TableName.AccessApprovalRequest}.policyId` as "policyId", policyId)
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "ResetReviewByPolicyId" });
    }
  };

  return {
    ...accessApprovalRequestOrm,
    findById,
    findRequestsWithPrivilegeByPolicyIds,
    getCount,
    resetReviewByPolicyId
  };
};
