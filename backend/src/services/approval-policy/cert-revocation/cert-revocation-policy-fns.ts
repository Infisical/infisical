import { ApproverType } from "../approval-policy-enums";

export type TRevocationPolicyStep = {
  requiredApprovals: number;
  approvers: { type: ApproverType; id: string }[];
};

export enum RevocationStepShortfallKind {
  NoApprovers = "no-approvers",
  TooFewApprovers = "too-few-approvers"
}

export type TRevocationStepShortfall =
  | { kind: RevocationStepShortfallKind.NoApprovers }
  | { kind: RevocationStepShortfallKind.TooFewApprovers; requiredApprovals: number; approverCount: number };

// A group's size isn't known when the policy is saved or a request is opened, so a step with a group approver is
// only refused when it has no approvers at all.
export const getRevocationStepShortfall = (step: TRevocationPolicyStep): TRevocationStepShortfall | null => {
  if (step.approvers.length === 0) return { kind: RevocationStepShortfallKind.NoApprovers };
  if (step.approvers.some((approver) => approver.type === ApproverType.Group)) return null;

  const approverCount = new Set(step.approvers.map((approver) => approver.id)).size;
  if (step.requiredApprovals > approverCount) {
    return {
      kind: RevocationStepShortfallKind.TooFewApprovers,
      requiredApprovals: step.requiredApprovals,
      approverCount
    };
  }
  return null;
};

export const formatApproverCount = (count: number) => `${count} approver${count === 1 ? "" : "s"}`;
