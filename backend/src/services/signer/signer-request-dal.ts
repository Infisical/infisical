import { TDbClient } from "@app/db";
import { TableName, TApprovalRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus
} from "../approval-policy/approval-policy-enums";

export type TSignerRequestDALFactory = ReturnType<typeof signerRequestDALFactory>;

export const signerRequestDALFactory = (db: TDbClient) => {
  const $buildSignerRequestsQuery = ({
    signerId,
    projectId,
    type
  }: {
    signerId: string;
    projectId: string;
    type: ApprovalPolicyType;
  }) => {
    const usageSubquery = db
      .replicaNode()(TableName.PkiSigningOperations)
      .select("approvalGrantId")
      .count("* as usedSignings")
      .where({ status: "success" })
      .whereNotNull("approvalGrantId")
      .groupBy("approvalGrantId")
      .as("usage");

    return db
      .replicaNode()(TableName.ApprovalRequests)
      .leftJoin(TableName.ApprovalRequestGrants, function joinGrants() {
        this.on(`${TableName.ApprovalRequestGrants}.requestId`, "=", `${TableName.ApprovalRequests}.id`);
      })
      .leftJoin(usageSubquery, "usage.approvalGrantId", `${TableName.ApprovalRequestGrants}.id`)
      .where(`${TableName.ApprovalRequests}.projectId`, projectId)
      .where(`${TableName.ApprovalRequests}.type`, type)
      .where(`${TableName.ApprovalRequests}.scopeType`, ApprovalPolicyScope.Signer)
      .where(`${TableName.ApprovalRequests}.scopeId`, signerId)
      .distinctOn(`${TableName.ApprovalRequests}.id`)
      .select(
        `${TableName.ApprovalRequests}.*`,
        db.ref("attributes").withSchema(TableName.ApprovalRequestGrants).as("grantAttributes"),
        db.ref("expiresAt").withSchema(TableName.ApprovalRequestGrants).as("grantExpiresAt"),
        db.ref("status").withSchema(TableName.ApprovalRequestGrants).as("grantStatus"),
        db.raw('COALESCE("usage"."usedSignings", 0) AS "usedSignings"'),
        // An approved request stays "approved" for good; the grant carries what happened to the access afterwards.
        // A grant past its expiresAt can still read "active" until the next sign attempt or the hourly cleanup marks
        // it, so the time is compared directly. A revoked grant reads as "cancelled", the status the signer's own
        // revoke sets, unless it was revoked after its window had already ended: that access expired on its own.
        db.raw(
          `CASE
            WHEN "${TableName.ApprovalRequests}"."status" = ? AND "${TableName.ApprovalRequestGrants}"."status" = ?
              AND (
                "${TableName.ApprovalRequestGrants}"."expiresAt" IS NULL
                OR "${TableName.ApprovalRequestGrants}"."revokedAt" IS NULL
                OR "${TableName.ApprovalRequestGrants}"."revokedAt" < "${TableName.ApprovalRequestGrants}"."expiresAt"
              )
              THEN ?
            WHEN "${TableName.ApprovalRequests}"."status" = ?
              AND ("${TableName.ApprovalRequestGrants}"."status" = ? OR "${TableName.ApprovalRequestGrants}"."expiresAt" <= NOW())
              THEN ?
            ELSE "${TableName.ApprovalRequests}"."status"
          END AS "accessStatus"`,
          [
            ApprovalRequestStatus.Approved,
            ApprovalRequestGrantStatus.Revoked,
            ApprovalRequestStatus.Cancelled,
            ApprovalRequestStatus.Approved,
            ApprovalRequestGrantStatus.Expired,
            ApprovalRequestStatus.Expired
          ]
        )
      )
      .orderByRaw(
        `"${TableName.ApprovalRequests}"."id", ("${TableName.ApprovalRequestGrants}"."status" = ?) DESC NULLS LAST, "${TableName.ApprovalRequestGrants}"."createdAt" DESC NULLS LAST`,
        [ApprovalRequestGrantStatus.Active]
      )
      .as("dedup");
  };

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
      const rows = (await db
        .replicaNode()
        .select("*")
        .from($buildSignerRequestsQuery({ signerId, projectId, type }))
        .modify((qb) => {
          if (statuses?.length) {
            void qb.whereIn("accessStatus", statuses);
          }
        })
        .orderBy("createdAt", "desc")
        .offset(offset)
        .limit(limit)) as (TApprovalRequests & {
        grantAttributes?: { maxSignings?: number | null } | null;
        grantExpiresAt?: Date | string | null;
        grantStatus?: string | null;
        usedSignings?: string | number;
        accessStatus: string;
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
      const result = (await db
        .replicaNode()
        .from($buildSignerRequestsQuery({ signerId, projectId, type }))
        .modify((qb) => {
          if (statuses?.length) {
            void qb.whereIn("accessStatus", statuses);
          }
        })
        .count("* as count")
        .first()) as { count: string | number } | undefined;
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
