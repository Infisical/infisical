import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { ApproverType } from "./approval-policy-enums";

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

      const approversByStepId = approvers.reduce<Record<string, { type: string; id: string }[]>>((acc, approver) => {
        const stepApprovers = acc[approver.policyStepId] || [];
        stepApprovers.push({
          type: approver.userId ? ApproverType.User : ApproverType.Group,
          id: (approver.userId || approver.groupId) as string
        });
        acc[approver.policyStepId] = stepApprovers;
        return acc;
      }, {});

      return steps.map((step) => {
        const stepApprovers = approversByStepId[step.id] || [];

        const formattedStep: {
          name?: string;
          requiredApprovals: number;
          notifyApprovers?: boolean;
          approvers: { type: string; id: string }[];
        } = {
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

  return {
    ...orm,
    findStepsByPolicyId
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

// Approval Policy Grants
export type TApprovalRequestGrantsDALFactory = ReturnType<typeof approvalRequestGrantsDALFactory>;
export const approvalRequestGrantsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequestGrants);
  return orm;
};
