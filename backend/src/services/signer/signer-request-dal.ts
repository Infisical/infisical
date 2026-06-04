import { TDbClient } from "@app/db";
import { TableName, TApprovalRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus
} from "../approval-policy/approval-policy-enums";

export type TSignerRequestDALFactory = ReturnType<typeof signerRequestDALFactory>;

export const signerRequestDALFactory = (db: TDbClient) => {
  const listSignerRequestsPaginated = async ({
    signerId,
    projectId,
    type,
    statuses,
    offset,
    limit
  }: {
    signerId: string;
    projectId: string;
    type: ApprovalPolicyType;
    statuses?: string[];
    offset: number;
    limit: number;
  }) => {
    try {
      const usageSubquery = db
        .replicaNode()(TableName.PkiSigningOperations)
        .select("approvalGrantId")
        .count("* as usedSignings")
        .where({ status: "success" })
        .whereNotNull("approvalGrantId")
        .groupBy("approvalGrantId")
        .as("usage");

      const dedupedRequests = db
        .replicaNode()(TableName.ApprovalRequests)
        .leftJoin(TableName.ApprovalRequestGrants, function joinGrants() {
          this.on(`${TableName.ApprovalRequestGrants}.requestId`, "=", `${TableName.ApprovalRequests}.id`);
        })
        .leftJoin(usageSubquery, "usage.approvalGrantId", `${TableName.ApprovalRequestGrants}.id`)
        .where(`${TableName.ApprovalRequests}.projectId`, projectId)
        .where(`${TableName.ApprovalRequests}.type`, type)
        .where(`${TableName.ApprovalRequests}.scopeType`, ApprovalPolicyScope.Signer)
        .where(`${TableName.ApprovalRequests}.scopeId`, signerId)
        .modify((qb) => {
          if (statuses?.length) {
            void qb.whereIn(`${TableName.ApprovalRequests}.status`, statuses);
          }
        })
        .distinctOn(`${TableName.ApprovalRequests}.id`)
        .select(
          `${TableName.ApprovalRequests}.*`,
          db.ref("attributes").withSchema(TableName.ApprovalRequestGrants).as("grantAttributes"),
          db.ref("expiresAt").withSchema(TableName.ApprovalRequestGrants).as("grantExpiresAt"),
          db.ref("status").withSchema(TableName.ApprovalRequestGrants).as("grantStatus"),
          db.raw('COALESCE("usage"."usedSignings", 0) AS "usedSignings"')
        )
        .orderByRaw(
          `"${TableName.ApprovalRequests}"."id", ("${TableName.ApprovalRequestGrants}"."status" = ?) DESC NULLS LAST, "${TableName.ApprovalRequestGrants}"."createdAt" DESC NULLS LAST`,
          [ApprovalRequestGrantStatus.Active]
        )
        .as("dedup");

      const rows = (await db
        .replicaNode()
        .select("*")
        .from(dedupedRequests)
        .orderBy("createdAt", "desc")
        .offset(offset)
        .limit(limit)) as (TApprovalRequests & {
        grantAttributes?: { maxSignings?: number | null } | null;
        grantExpiresAt?: Date | string | null;
        grantStatus?: string | null;
        usedSignings?: string | number;
      })[];
      return rows.map((row) => ({
        ...row,
        expiresAt: row.grantExpiresAt ?? row.expiresAt ?? null,
        maxSignings: row.grantAttributes?.maxSignings ?? null,
        usedSignings: Number(row.usedSignings ?? 0),
        grantStatus: row.grantStatus ?? null
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "ListSignerRequestsPaginated" });
    }
  };

  const countSignerRequests = async ({
    signerId,
    projectId,
    type,
    statuses
  }: {
    signerId: string;
    projectId: string;
    type: ApprovalPolicyType;
    statuses?: string[];
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.ApprovalRequests)
        .where({ projectId, type, scopeType: ApprovalPolicyScope.Signer, scopeId: signerId });
      if (statuses?.length) {
        void query.whereIn("status", statuses);
      }
      const result = (await query.count("* as count").first()) as { count: string | number } | undefined;
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSignerRequests" });
    }
  };

  return {
    listSignerRequestsPaginated,
    countSignerRequests
  };
};
