import { BadRequestError } from "@app/lib/errors";

import { ApproverType } from "./approval-policy-enums";
import { ApprovalPolicyStep } from "./approval-policy-types";

type TPolicyStepShape = Pick<ApprovalPolicyStep, "name" | "requiredApprovals" | "approvers">;

const describeStep = (step: Pick<ApprovalPolicyStep, "name">, index: number) =>
  step.name ? `Approval step ${index + 1} ('${step.name}')` : `Approval step ${index + 1}`;

// A request is approved only by completing every step, so a policy any step of which can never complete leaves its
// requests pending until they expire, or forever when the policy sets no max TTL.
export const findPolicyStepsProblem = ({
  steps,
  hasAutoApprovalRules,
  supportsAutoApproval
}: {
  steps: TPolicyStepShape[];
  hasAutoApprovalRules: boolean;
  supportsAutoApproval: boolean;
}): string | null => {
  if (steps.length === 0) {
    if (hasAutoApprovalRules) return null;
    return supportsAutoApproval
      ? "Add at least one approval step or an auto-approval rule. Without either, requests on this policy can never be approved."
      : "Add at least one approval step. Without one, requests on this policy can never be approved.";
  }

  for (const [index, step] of steps.entries()) {
    if (step.approvers.length === 0) {
      return `${describeStep(step, index)} has no approvers. Add at least one user or group.`;
    }

    // A group's members can change after the policy is saved, so only a step naming users alone has a fixed size.
    if (!step.approvers.some((approver) => approver.type === ApproverType.Group)) {
      const userCount = new Set(step.approvers.map((approver) => approver.id)).size;
      if (step.requiredApprovals > userCount) {
        return `${describeStep(step, index)} requires ${step.requiredApprovals} approvals but names only ${userCount} ${
          userCount === 1 ? "approver" : "approvers"
        }. Lower the required approvals or add approvers.`;
      }
    }
  }

  return null;
};

export const assertPolicyStepsCanApprove = (args: Parameters<typeof findPolicyStepsProblem>[0]) => {
  const problem = findPolicyStepsProblem(args);
  if (problem) throw new BadRequestError({ message: problem });
};
