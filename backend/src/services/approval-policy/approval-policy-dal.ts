import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
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
