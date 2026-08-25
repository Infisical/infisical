import { Approver } from "@app/hooks/api/accessApproval/types";

export type TApprovalSequence = {
  user: Approver[];
  group: Approver[];
  sequence: number;
  approvals: number;
};

export const groupApproversBySequence = (approvers: Approver[] = [], fallbackApprovals: number) =>
  [...approvers]
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
