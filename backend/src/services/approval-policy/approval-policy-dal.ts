import { TDbClient } from "@app/db";
import { TableName, TApprovalRequestApprovals } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import {
  ApprovalPolicyType,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApproverType
} from "./approval-policy-enums";
import { ApprovalPolicyStep } from "./approval-policy-types";

// Approval Policy
export type TApprovalPolicyDALFactory = ReturnType<typeof approvalPolicyDALFactory>;
export const approvalPolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicies);

  const findStepsByPolicyId = async (policyId: string) => {
    try {
      const dbInstance = db.replicaNode();
      const steps = await dbInstance(TableName.ApprovalPolicySteps).where({ policyId }).orderBy("stepNumber", "asc");

      if (!steps.length) {
        return [];
      }

      const stepIds = steps.map((step) => step.id);

      const approvers = await dbInstance(TableName.ApprovalPolicyStepApprovers)
        .whereIn("policyStepId", stepIds)
        .select("policyStepId", "userId", "groupId");

      const approversByStepId = approvers.reduce<Record<string, { type: ApproverType; id: string }[]>>(
        (acc, approver) => {
          const stepApprovers = acc[approver.policyStepId] || [];
          stepApprovers.push({
            type: approver.userId ? ApproverType.User : ApproverType.Group,
            id: (approver.userId || approver.groupId) as string
          });
          acc[approver.policyStepId] = stepApprovers;
          return acc;
        },
        {}
      );

      return steps.map((step) => {
        const stepApprovers = approversByStepId[step.id] || [];

        const formattedStep: ApprovalPolicyStep = {
          requiredApprovals: step.requiredApprovals,
          approvers: stepApprovers
        };

        if (step.name) {
          formattedStep.name = step.name;
        }
        if (typeof step.notifyApprovers === "boolean") {
          formattedStep.notifyApprovers = step.notifyApprovers;
        }

        return formattedStep;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy steps" });
    }
  };

  const findByProjectId = async (policyType: ApprovalPolicyType, projectId: string) => {
    try {
      const dbInstance = db.replicaNode();
      const policies = await dbInstance(TableName.ApprovalPolicies).where({ type: policyType, projectId });

      if (!policies.length) {
        return [];
      }

      const policyIds = policies.map((p) => p.id);

      const steps = await dbInstance(TableName.ApprovalPolicySteps)
        .whereIn("policyId", policyIds)
        .orderBy("stepNumber", "asc");

      const stepsByPolicyId: Record<string, ApprovalPolicyStep[]> = {};

      if (steps.length) {
        const stepIds = steps.map((step) => step.id);

        const approvers = await dbInstance(TableName.ApprovalPolicyStepApprovers)
          .whereIn("policyStepId", stepIds)
          .select("policyStepId", "userId", "groupId");

        const approversByStepId = approvers.reduce<Record<string, { type: ApproverType; id: string }[]>>(
          (acc, approver) => {
            const stepApprovers = acc[approver.policyStepId] || [];
            stepApprovers.push({
              type: approver.userId ? ApproverType.User : ApproverType.Group,
              id: (approver.userId || approver.groupId) as string
            });
            acc[approver.policyStepId] = stepApprovers;
            return acc;
          },
          {}
        );

        steps.forEach((step) => {
          const stepApprovers = approversByStepId[step.id] || [];
          const formattedStep: ApprovalPolicyStep = {
            requiredApprovals: step.requiredApprovals,
            approvers: stepApprovers
          };

          if (step.name) {
            formattedStep.name = step.name;
          }
          if (typeof step.notifyApprovers === "boolean") {
            formattedStep.notifyApprovers = step.notifyApprovers;
          }

          if (!stepsByPolicyId[step.policyId]) {
            stepsByPolicyId[step.policyId] = [];
          }
          stepsByPolicyId[step.policyId].push(formattedStep);
        });
      }

      return policies.map((policy) => ({
        ...policy,
        steps: stepsByPolicyId[policy.id] || []
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policies by project id" });
    }
  };

  return {
    ...orm,
    findStepsByPolicyId,
    findByProjectId
  };
};

// Approval Policy Steps
export type TApprovalPolicyStepsDALFactory = ReturnType<typeof approvalPolicyStepsDALFactory>;
export const approvalPolicyStepsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicySteps);
  return orm;
};

// Approval Policy Step Approvers
export type TApprovalPolicyStepApproversDALFactory = ReturnType<typeof approvalPolicyStepApproversDALFactory>;
export const approvalPolicyStepApproversDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicyStepApprovers);
  return orm;
};

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

  const findByProjectId = async (policyType: ApprovalPolicyType, projectId: string) => {
    try {
      const dbInstance = db.replicaNode();
      const requests = await dbInstance(TableName.ApprovalRequests).where({ type: policyType, projectId });

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

  const markExpiredRequests = async () => {
    try {
      const result = await db(TableName.ApprovalRequests)
        .where("status", ApprovalRequestStatus.Pending)
        .whereNotNull("expiresAt")
        .where("expiresAt", "<", new Date())
        .update({ status: ApprovalRequestStatus.Expired });

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark expired approval requests" });
    }
  };

  return { ...orm, findStepsByRequestId, findByProjectId, markExpiredRequests };
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

  return { ...orm, markExpiredGrants };
};

// Approval Request Approvals
export type TApprovalRequestApprovalsDALFactory = ReturnType<typeof approvalRequestApprovalsDALFactory>;
export const approvalRequestApprovalsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequestApprovals);
  return orm;
};
