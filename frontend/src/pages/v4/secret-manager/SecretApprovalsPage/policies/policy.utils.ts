import type { Approver } from "@app/hooks/api/accessApproval/types";
import { PolicyType } from "@app/hooks/api/policies/enums";

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  [PolicyType.ChangePolicy]: "Change policy",
  [PolicyType.AccessPolicy]: "Access policy"
};

type TApprovalStep = {
  user: unknown[];
  group: unknown[];
};

export const getEmptyApprovalStepIndexes = (steps: TApprovalStep[] = []) =>
  steps.reduce<number[]>((emptyStepIndexes, step, index) => {
    if (!(step.user.length || step.group.length)) emptyStepIndexes.push(index);
    return emptyStepIndexes;
  }, []);

export type TApprovalSequence = {
  user: Approver[];
  group: Approver[];
  sequence: number;
  approvals: number;
};

export const groupApproversBySequence = (
  approvers: Approver[] | undefined,
  fallbackApprovals: number
) =>
  [...(approvers ?? [])]
    .sort((a, b) => (a.sequence ?? 1) - (b.sequence ?? 1))
    .reduce<TApprovalSequence[]>((steps, approver) => {
      const sequence = approver.sequence ?? 1;
      const existingStep = steps[steps.length - 1];

      if (existingStep?.sequence === sequence) {
        existingStep[approver.type].push(approver);
        return steps;
      }

      const step: TApprovalSequence = {
        user: [],
        group: [],
        sequence,
        approvals: approver.approvalsRequired ?? fallbackApprovals
      };
      step[approver.type].push(approver);
      steps.push(step);

      return steps;
    }, []);
