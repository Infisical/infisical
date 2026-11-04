import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols } from "@app/lib/knex";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

export type TSecretAccessApprovalGlobalRequestBridgeDALFactory = ReturnType<
  typeof secretAccessApprovalGlobalRequestBridgeDALFactory
>;

export const secretAccessApprovalGlobalRequestBridgeDALFactory = (db: TDbClient) => {
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
