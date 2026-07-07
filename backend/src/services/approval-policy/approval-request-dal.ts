import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TApprovalRequestApprovals, TApprovalRequestSteps } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import {
  ApprovalPolicyType,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApproverType
} from "./approval-policy-enums";

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

      const stepsByRequestId: Record<
        string,
        (TApprovalRequestSteps & {
          approvers: { type: ApproverType; id: string }[];
          approvals: TApprovalRequestApprovals[];
        })[]
      > = {};

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

  const markExpiredRequests = async (): Promise<number> => {
    try {
      const rows = await db(TableName.ApprovalRequests)
        .where("status", ApprovalRequestStatus.Pending)
        .whereNotNull("expiresAt")
        .where("expiresAt", "<", new Date())
        .update({ status: ApprovalRequestStatus.Expired })
        .returning<{ id: string }[]>("id");
      return rows.length;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark expired approval requests" });
    }
  };

  return {
    ...orm,
    findStepsByRequestId,
    findByProjectId,
    findByIdForUpdate,
    markExpiredRequests
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
