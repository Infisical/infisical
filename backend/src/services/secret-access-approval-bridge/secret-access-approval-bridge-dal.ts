import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import { AccessScope, TableName, TUsers } from "@app/db/schemas";
import { ApproverType, BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { SecretAccessPolicyConstraintsSchema } from "@app/services/approval-policy/secret-access/secret-access-policy-schemas";

const StoredConstraintsSchema = z.object({ version: z.literal(1), constraints: SecretAccessPolicyConstraintsSchema });

const parseConstraints = (constraints: unknown) => {
  const parsed = StoredConstraintsSchema.safeParse(constraints);
  if (parsed.success) return parsed.data.constraints;
  return { allowedSelfApprovals: true, requestExpirationTime: null, maxTimePeriod: null };
};

export type TSecretAccessApprovalBridgeDALFactory = ReturnType<typeof secretAccessApprovalBridgeDALFactory>;

export const secretAccessApprovalBridgeDALFactory = (db: TDbClient) => {
  const findSecretAccessPolicies = async (
    { policyId, projectId, envId }: { policyId?: string; projectId?: string; envId?: string },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.ApprovalPolicies)
        .where(`${TableName.ApprovalPolicies}.type`, ApprovalPolicyType.SecretAccess)
        .where((qb) => {
          if (policyId) void qb.where(`${TableName.ApprovalPolicies}.id`, policyId);
          if (projectId) void qb.where(`${TableName.ApprovalPolicies}.projectId`, projectId);
        })
        .join(
          TableName.ApprovalPolicySecretEnvironment,
          `${TableName.ApprovalPolicies}.id`,
          `${TableName.ApprovalPolicySecretEnvironment}.policyId`
        )
        .join(
          TableName.Environment,
          `${TableName.ApprovalPolicySecretEnvironment}.envId`,
          `${TableName.Environment}.id`
        )
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .where((qb) => {
          if (envId) void qb.where(`${TableName.ApprovalPolicySecretEnvironment}.envId`, envId);
        })
        .leftJoin(
          TableName.ApprovalPolicySteps,
          `${TableName.ApprovalPolicies}.id`,
          `${TableName.ApprovalPolicySteps}.policyId`
        )
        .leftJoin(
          TableName.ApprovalPolicyStepApprovers,
          `${TableName.ApprovalPolicySteps}.id`,
          `${TableName.ApprovalPolicyStepApprovers}.policyStepId`
        )
        .leftJoin(TableName.Users, `${TableName.ApprovalPolicyStepApprovers}.userId`, `${TableName.Users}.id`)
        .leftJoin(
          TableName.ApprovalPolicyBypassers,
          `${TableName.ApprovalPolicies}.id`,
          `${TableName.ApprovalPolicyBypassers}.policyId`
        )
        .leftJoin<TUsers>(
          db(TableName.Users).as("bypasserUsers"),
          `${TableName.ApprovalPolicyBypassers}.userId`,
          "bypasserUsers.id"
        )
        .select(selectAllTableCols(TableName.ApprovalPolicies))
        .select(
          db.ref("secretPath").withSchema(TableName.ApprovalPolicySecretEnvironment),
          db.ref("id").withSchema(TableName.Environment).as("environmentId"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("id").withSchema(TableName.ApprovalPolicySteps).as("stepId"),
          db.ref("stepNumber").withSchema(TableName.ApprovalPolicySteps),
          db.ref("requiredApprovals").withSchema(TableName.ApprovalPolicySteps),
          db.ref("id").withSchema(TableName.ApprovalPolicyStepApprovers).as("approverRowId"),
          db.ref("userId").withSchema(TableName.ApprovalPolicyStepApprovers).as("approverUserId"),
          db.ref("groupId").withSchema(TableName.ApprovalPolicyStepApprovers).as("approverGroupId"),
          db.ref("username").withSchema(TableName.Users).as("approverUsername"),
          db.ref("userId").withSchema(TableName.ApprovalPolicyBypassers).as("bypasserUserId"),
          db.ref("groupId").withSchema(TableName.ApprovalPolicyBypassers).as("bypasserGroupId"),
          db.ref("username").withSchema("bypasserUsers").as("bypasserUsername")
        )
        .orderBy(`${TableName.ApprovalPolicySteps}.stepNumber`, "asc");

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => {
          const { allowedSelfApprovals, requestExpirationTime, maxTimePeriod } = parseConstraints(data.constraints);
          return {
            id: data.id,
            name: data.name,
            projectId: data.projectId,
            enforcementLevel: data.enforcementLevel,
            bypassForMachineIdentities: data.bypassForMachineIdentities ?? false,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            deletedAt: null as Date | null,
            secretPath: data.secretPath,
            envId: data.environmentId,
            maxTimePeriod,
            allowedSelfApprovals,
            requestExpirationTime
          };
        },
        childrenMapper: [
          {
            key: "stepId",
            label: "steps" as const,
            mapper: ({ stepId: id, stepNumber, requiredApprovals }) => ({ id, stepNumber, requiredApprovals })
          },
          {
            key: "approverRowId",
            label: "approvers" as const,
            mapper: ({ approverUserId, approverGroupId, approverUsername, stepNumber, requiredApprovals }) =>
              approverUserId
                ? {
                    id: approverUserId,
                    type: ApproverType.User as const,
                    name: approverUsername,
                    sequence: stepNumber,
                    approvalsRequired: requiredApprovals
                  }
                : {
                    id: approverGroupId,
                    type: ApproverType.Group as const,
                    sequence: stepNumber,
                    approvalsRequired: requiredApprovals
                  }
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserUserId: id, bypasserUsername }) => ({
              id,
              type: BypasserType.User as const,
              name: bypasserUsername
            })
          },
          {
            key: "bypasserGroupId",
            label: "bypassers" as const,
            mapper: ({ bypasserGroupId: id }) => ({ id, type: BypasserType.Group as const })
          },
          {
            key: "environmentId",
            label: "environments" as const,
            mapper: ({ environmentId: id, envName, envSlug }) => ({ id, name: envName, slug: envSlug })
          }
        ]
      });

      return formattedDocs.map(({ steps, ...policy }) => {
        const [firstStep] = steps.sort((a, b) => a.stepNumber - b.stepNumber);
        return {
          ...policy,
          approvals: firstStep?.requiredApprovals ?? 1,
          approvers: policy.approvers.sort((a, b) => (a.sequence || 1) - (b.sequence || 1)),
          environment: policy.environments[0]
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret access approval policies" });
    }
  };

  const findSecretAccessRequestById = async (requestId: string, tx?: Knex) => {
    try {
      const request = await (tx || db.replicaNode())(TableName.ApprovalRequests)
        .where({ id: requestId, type: ApprovalPolicyType.SecretAccess })
        .first();
      if (!request) return null;

      const grant = await (tx || db.replicaNode())(TableName.ApprovalRequestGrants)
        .where({ requestId: request.id, type: ApprovalPolicyType.SecretAccess })
        .orderBy("createdAt", "desc")
        .first();

      const privilege = grant
        ? await (tx || db.replicaNode())(TableName.AdditionalPrivilege).where({ grantId: grant.id }).first()
        : undefined;

      return { ...request, grant: grant ?? null, privilegeId: privilege?.id ?? null };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret access approval request by id" });
    }
  };

  const findPendingRequests = async ({ policyId, requesterId }: { policyId: string; requesterId: string }) => {
    try {
      return await db
        .replicaNode()(TableName.ApprovalRequests)
        .where({ policyId, requesterId, type: ApprovalPolicyType.SecretAccess, status: ApprovalRequestStatus.Pending })
        .where((qb) => {
          void qb.whereNull("expiresAt").orWhere("expiresAt", ">", new Date());
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find pending secret access approval requests" });
    }
  };

  const findSecretAccessRequests = async ({
    projectId,
    policyId,
    requesterId
  }: {
    projectId: string;
    policyId?: string;
    requesterId?: string;
  }) => {
    try {
      return await db
        .replicaNode()(TableName.ApprovalRequests)
        .where({ projectId, type: ApprovalPolicyType.SecretAccess })
        .where((qb) => {
          if (policyId) void qb.where("policyId", policyId);
          if (requesterId) void qb.where("requesterId", requesterId);
        })
        .orderBy("createdAt", "desc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret access approval requests" });
    }
  };

  const findGrantsByRequestIds = async (requestIds: string[]) => {
    if (!requestIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.ApprovalRequestGrants)
        .whereIn("requestId", requestIds)
        .where({ type: ApprovalPolicyType.SecretAccess })
        .orderBy("createdAt", "desc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret access grants by request ids" });
    }
  };

  const findPrivilegesByGrantIds = async (grantIds: string[]) => {
    if (!grantIds.length) return [];
    try {
      return await db.replicaNode()(TableName.AdditionalPrivilege).whereIn("grantId", grantIds);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find additional privileges by grant ids" });
    }
  };

  const findApprovalsByRequestIds = async (requestIds: string[]) => {
    if (!requestIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.ApprovalRequestApprovals)
        .join(
          TableName.ApprovalRequestSteps,
          `${TableName.ApprovalRequestApprovals}.stepId`,
          `${TableName.ApprovalRequestSteps}.id`
        )
        .whereIn(`${TableName.ApprovalRequestSteps}.requestId`, requestIds)
        .select(selectAllTableCols(TableName.ApprovalRequestApprovals))
        .select(db.ref("requestId").withSchema(TableName.ApprovalRequestSteps))
        .orderBy(`${TableName.ApprovalRequestApprovals}.createdAt`, "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approvals by request ids" });
    }
  };

  const findGroupMembers = async (groupIds: string[]) => {
    if (!groupIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.UserGroupMembership)
        .whereIn("groupId", groupIds)
        .select("groupId", "userId");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group members" });
    }
  };

  const findUsersByIds = async (userIds: string[]) => {
    if (!userIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.Users)
        .whereIn("id", userIds)
        .select("id", "email", "username", "firstName", "lastName");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find users by ids" });
    }
  };

  const findOrgMembershipActivity = async (orgId: string, userIds: string[]) => {
    if (!userIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.Membership)
        .where({ scope: AccessScope.Organization, scopeOrgId: orgId })
        .whereIn("actorUserId", userIds)
        .select("actorUserId", "isActive");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org membership activity" });
    }
  };

  return {
    findSecretAccessPolicies,
    findSecretAccessRequestById,
    findSecretAccessRequests,
    findPendingRequests,
    findGrantsByRequestIds,
    findPrivilegesByGrantIds,
    findApprovalsByRequestIds,
    findGroupMembers,
    findUsersByIds,
    findOrgMembershipActivity
  };
};
