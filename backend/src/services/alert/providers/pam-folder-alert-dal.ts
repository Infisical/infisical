import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision
} from "@app/services/approval-policy/approval-policy-enums";

export type TPamFolderAlertDALFactory = ReturnType<typeof pamFolderAlertDALFactory>;

// Event-path reads go to the primary: the request commits with the event, and an empty read is terminal.
export const pamFolderAlertDALFactory = (db: TDbClient) => {
  const findFolderById = async (
    folderId: string,
    { readFromPrimary = false }: { readFromPrimary?: boolean } = {},
    tx?: Knex
  ) => {
    try {
      const folder = (await (tx || (readFromPrimary ? db : db.replicaNode()))(TableName.PamFolder)
        .join(TableName.Project, `${TableName.PamFolder}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.PamFolder}.id`, folderId)
        .where(`${TableName.Project}.type`, ProjectType.PAM)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(`${TableName.PamFolder}.name`, `${TableName.PamFolder}.projectId`, `${TableName.Project}.orgId`)
        .first()) as { name: string; projectId: string; orgId: string } | undefined;

      return folder;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPamAlertFolderById" });
    }
  };

  const findAccessRequestsByIds = async (
    { orgId, projectId, requestIds }: { orgId: string; projectId: string; requestIds: string[] },
    tx?: Knex
  ) => {
    try {
      const requests = (await (tx || db)(TableName.ApprovalRequests)
        .whereIn("id", requestIds)
        .where({ organizationId: orgId, projectId, type: ApprovalPolicyType.PamAccess })
        .select("id", "requesterId", "requesterName", "requesterEmail", "machineIdentityId", "requestData")
        .orderBy("createdAt", "asc")) as {
        id: string;
        requesterId: string | null;
        requesterName: string;
        requesterEmail: string;
        machineIdentityId: string | null;
        requestData: unknown;
      }[];

      return requests;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPamAlertAccessRequestsByIds" });
    }
  };

  const findAccountNamesByIds = async (
    { projectId, accountIds }: { projectId: string; accountIds: string[] },
    tx?: Knex
  ) => {
    if (accountIds.length === 0) return [];
    try {
      const accounts = (await (tx || db)(TableName.PamAccount)
        .whereIn("id", accountIds)
        .where({ projectId })
        .select("id", "name")) as { id: string; name: string }[];

      return accounts;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPamAlertAccountNamesByIds" });
    }
  };

  const findDecisionCommentsByRequestIds = async (
    { requestIds, decision }: { requestIds: string[]; decision: ApprovalRequestApprovalDecision },
    tx?: Knex
  ) => {
    try {
      const decisions = (await (tx || db)(TableName.ApprovalRequestApprovals)
        .join(
          TableName.ApprovalRequestSteps,
          `${TableName.ApprovalRequestApprovals}.stepId`,
          `${TableName.ApprovalRequestSteps}.id`
        )
        .whereIn(`${TableName.ApprovalRequestSteps}.requestId`, requestIds)
        .where(`${TableName.ApprovalRequestApprovals}.decision`, decision)
        .select(`${TableName.ApprovalRequestSteps}.requestId`, `${TableName.ApprovalRequestApprovals}.comment`)
        .orderBy(`${TableName.ApprovalRequestApprovals}.createdAt`, "asc")) as {
        requestId: string;
        comment: string | null;
      }[];

      return decisions;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPamAlertDecisionCommentsByRequestIds" });
    }
  };

  const findBypassReasonsByRequestIds = async (requestIds: string[], tx?: Knex) => {
    try {
      const grants = (await (tx || db)(TableName.ApprovalRequestGrants)
        .whereIn("requestId", requestIds)
        .select("requestId", "bypassReason")) as { requestId: string; bypassReason: string | null }[];

      return grants;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPamAlertBypassReasonsByRequestIds" });
    }
  };

  return {
    findFolderById,
    findAccessRequestsByIds,
    findAccountNamesByIds,
    findDecisionCommentsByRequestIds,
    findBypassReasonsByRequestIds
  };
};
