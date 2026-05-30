import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TApprovalRequestApprovals, TApprovalRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApproverType
} from "./approval-policy-enums";
import { ApprovalPolicyStep } from "./approval-policy-types";

// Approval Request
export type TApprovalRequestDALFactory = ReturnType<typeof approvalRequestDALFactory>;
export const approvalRequestDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequests);

  const findStepsByRequestId = async (requestId: string) => {
    try {
      const dbInstance = db.replicaNode();
      const steps = await dbInstance(TableName.ApprovalRequestSteps).where({ requestId }).orderBy("stepNumber", "asc");

      if (!steps.length) {
        return [];
      }

      const stepIds = steps.map((step) => step.id);

      const [approvers, approvals] = await Promise.all([
        dbInstance(TableName.ApprovalRequestStepEligibleApprovers)
          .whereIn("stepId", stepIds)
          .select("stepId", "userId", "groupId"),
        dbInstance(TableName.ApprovalRequestApprovals).whereIn("stepId", stepIds)
      ]);

      const approversByStepId = approvers.reduce<Record<string, { type: ApproverType; id: string }[]>>(
        (acc, approver) => {
          const stepApprovers = acc[approver.stepId] || [];
          stepApprovers.push({
            type: approver.userId ? ApproverType.User : ApproverType.Group,
            id: (approver.userId || approver.groupId) as string
          });
          acc[approver.stepId] = stepApprovers;
          return acc;
        },
        {}
      );

      const approvalsByStepId = approvals.reduce<Record<string, TApprovalRequestApprovals[]>>((acc, approval) => {
        const stepApprovals = acc[approval.stepId] || [];
        stepApprovals.push(approval);
        acc[approval.stepId] = stepApprovals;
        return acc;
      }, {});

      return steps.map((step) => {
        return {
          ...step,
          approvers: approversByStepId[step.id] || [],
          approvals: approvalsByStepId[step.id] || []
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval request steps" });
    }
  };

  const findByProjectId = async (
    policyType: ApprovalPolicyType,
    projectId: string,
    options?: { scopeType?: string | null; scopeId?: string | null }
  ) => {
    try {
      const dbInstance = db.replicaNode();
      const baseQuery = dbInstance(TableName.ApprovalRequests).where({ type: policyType, projectId });

      if (options?.scopeType === null) {
        void baseQuery.whereNull("scopeType");
      } else if (typeof options?.scopeType === "string") {
        void baseQuery.where({ scopeType: options.scopeType });
        if (typeof options?.scopeId === "string") {
          void baseQuery.where({ scopeId: options.scopeId });
        }
      }

      const requests = await baseQuery;

      if (!requests.length) {
        return [];
      }

      const requestIds = requests.map((req) => req.id);

      const steps = await dbInstance(TableName.ApprovalRequestSteps)
        .whereIn("requestId", requestIds)
        .orderBy("stepNumber", "asc");

      const stepsByRequestId: Record<string, ApprovalPolicyStep[]> = {};

      if (steps.length) {
        const stepIds = steps.map((step) => step.id);

        const [approvers, approvals] = await Promise.all([
          dbInstance(TableName.ApprovalRequestStepEligibleApprovers)
            .whereIn("stepId", stepIds)
            .select("stepId", "userId", "groupId"),
          dbInstance(TableName.ApprovalRequestApprovals).whereIn("stepId", stepIds)
        ]);

        const approversByStepId = approvers.reduce<Record<string, { type: ApproverType; id: string }[]>>(
          (acc, approver) => {
            const stepApprovers = acc[approver.stepId] || [];
            stepApprovers.push({
              type: approver.userId ? ApproverType.User : ApproverType.Group,
              id: (approver.userId || approver.groupId) as string
            });
            acc[approver.stepId] = stepApprovers;
            return acc;
          },
          {}
        );

        const approvalsByStepId = approvals.reduce<Record<string, TApprovalRequestApprovals[]>>((acc, approval) => {
          const stepApprovals = acc[approval.stepId] || [];
          stepApprovals.push(approval);
          acc[approval.stepId] = stepApprovals;
          return acc;
        }, {});

        steps.forEach((step) => {
          const formattedStep = {
            ...step,
            approvers: approversByStepId[step.id] || [],
            approvals: approvalsByStepId[step.id] || []
          };

          if (!stepsByRequestId[step.requestId]) {
            stepsByRequestId[step.requestId] = [];
          }
          stepsByRequestId[step.requestId].push(formattedStep);
        });
      }

      return requests.map((req) => ({
        ...req,
        steps: stepsByRequestId[req.id] || []
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval requests by project id" });
    }
  };

  const findByIdForUpdate = async (id: string, tx: Knex) => {
    try {
      const row = await tx(TableName.ApprovalRequests).forUpdate().where({ id }).first();
      return row || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindApprovalRequestByIdForUpdate" });
    }
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
          db.ref("grantedByUserId").withSchema(TableName.ApprovalRequestGrants).as("grantedByUserId"),
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
        grantedByUserId?: string | null;
        usedSignings?: string | number;
      })[];
      return rows.map((row) => ({
        ...row,
        expiresAt: row.grantExpiresAt ?? row.expiresAt ?? null,
        maxSignings: row.grantAttributes?.maxSignings ?? null,
        usedSignings: Number(row.usedSignings ?? 0),
        grantStatus: row.grantStatus ?? null,
        grantedByUserId: row.grantedByUserId ?? null
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

  const markExpiredRequests = async (): Promise<string[]> => {
    try {
      const expiredRequestIds = await db(TableName.ApprovalRequests)
        .where("status", ApprovalRequestStatus.Pending)
        .whereNotNull("expiresAt")
        .where("expiresAt", "<", new Date())
        .select("id");

      if (expiredRequestIds.length === 0) {
        return [];
      }

      const ids = expiredRequestIds.map((r) => r.id);

      await db(TableName.ApprovalRequests).whereIn("id", ids).update({ status: ApprovalRequestStatus.Expired });

      return ids;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark expired approval requests" });
    }
  };

  return {
    ...orm,
    findStepsByRequestId,
    findByProjectId,
    findByIdForUpdate,
    markExpiredRequests,
    listSignerRequestsPaginated,
    countSignerRequests
  };
};

// Approval Request Steps
export type TApprovalRequestStepsDALFactory = ReturnType<typeof approvalRequestStepsDALFactory>;
export const approvalRequestStepsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequestSteps);
  return orm;
};

// Approval Request Step Eligible Approvers
export type TApprovalRequestStepEligibleApproversDALFactory = ReturnType<
  typeof approvalRequestStepEligibleApproversDALFactory
>;
export const approvalRequestStepEligibleApproversDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequestStepEligibleApprovers);
  return orm;
};

// Approval Request Grants
export type TApprovalRequestGrantsDALFactory = ReturnType<typeof approvalRequestGrantsDALFactory>;
export const approvalRequestGrantsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequestGrants);

  const findByIdForUpdate = async (id: string, tx: Knex) => {
    try {
      const grant = await tx(TableName.ApprovalRequestGrants).forUpdate().where({ id }).first();
      return grant || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindApprovalRequestGrantByIdForUpdate" });
    }
  };

  const markExpiredGrants = async () => {
    try {
      const result = await db(TableName.ApprovalRequestGrants)
        .where("status", ApprovalRequestGrantStatus.Active)
        .whereNotNull("expiresAt")
        .where("expiresAt", "<", new Date())
        .update({ status: ApprovalRequestGrantStatus.Expired });

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark expired approval grants" });
    }
  };

  const findByProjectAndScope = async (filter: {
    projectId: string;
    type: string;
    scopeType: string | null;
    scopeId: string | null;
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.ApprovalRequestGrants)
        .leftJoin(
          TableName.ApprovalRequests,
          `${TableName.ApprovalRequests}.id`,
          `${TableName.ApprovalRequestGrants}.requestId`
        )
        .where(`${TableName.ApprovalRequestGrants}.projectId`, filter.projectId)
        .where(`${TableName.ApprovalRequestGrants}.type`, filter.type)
        .select(selectAllTableCols(TableName.ApprovalRequestGrants));

      if (filter.scopeType === null) {
        void query.whereNull(`${TableName.ApprovalRequests}.scopeType`);
      } else {
        void query
          .where(`${TableName.ApprovalRequests}.scopeType`, filter.scopeType)
          .where(`${TableName.ApprovalRequests}.scopeId`, filter.scopeId as string);
      }

      const grants = await query;
      return grants as Awaited<ReturnType<typeof orm.find>>;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindGrantsByProjectAndScope" });
    }
  };

  return { ...orm, findByIdForUpdate, markExpiredGrants, findByProjectAndScope };
};

// Approval Request Approvals
export type TApprovalRequestApprovalsDALFactory = ReturnType<typeof approvalRequestApprovalsDALFactory>;
export const approvalRequestApprovalsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequestApprovals);
  return orm;
};
