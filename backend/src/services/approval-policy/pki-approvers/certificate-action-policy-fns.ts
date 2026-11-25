import { ApprovalPolicyType } from "../approval-policy-enums";
import { approverKey, TApproverEntry, TApprovingPeople } from "./application-approver-checks";

export type TCertificateActionPolicyType = ApprovalPolicyType.CertRevocation | ApprovalPolicyType.CertDeletion;

export const CERTIFICATE_ACTIONS: Record<TCertificateActionPolicyType, { label: string; noun: string; verb: string }> =
  {
    [ApprovalPolicyType.CertRevocation]: { label: "Revocation", noun: "revocation", verb: "revoke" },
    [ApprovalPolicyType.CertDeletion]: { label: "Deletion", noun: "deletion", verb: "delete" }
  };

export enum ApprovalStepShortfallKind {
  NoApprovers = "no-approvers",
  TooFewApprovers = "too-few-approvers"
}

export type TApprovalStepShortfall =
  | { kind: ApprovalStepShortfallKind.NoApprovers }
  | { kind: ApprovalStepShortfallKind.TooFewApprovers; requiredApprovals: number; approverCount: number };

export const getApprovalStepShortfall = ({
  requiredApprovals,
  approverCount
}: {
  requiredApprovals: number;
  approverCount: number;
}): TApprovalStepShortfall | null => {
  if (approverCount === 0) return { kind: ApprovalStepShortfallKind.NoApprovers };
  if (requiredApprovals > approverCount) {
    return { kind: ApprovalStepShortfallKind.TooFewApprovers, requiredApprovals, approverCount };
  }
  return null;
};

export const formatApproverCount = (count: number) => `${count} approver${count === 1 ? "" : "s"}`;

export const findPeopleWhoCanApprove = (approvers: TApproverEntry[], people: TApprovingPeople) =>
  new Set(approvers.flatMap((approver) => [...(people.get(approverKey(approver)) ?? [])]));

export type TCertificateActionRequestStep = {
  stepNumber: number;
  requiredApprovals: number;
  approvers: TApproverEntry[];
  approvals: { approverUserId: string }[];
};

// A rejection ends a request, so every vote on the step in progress is an approval, and each person votes once. The
// step can still pass while the people who can approve and haven't voted cover the approvals it still needs, and a
// later step while it has as many people who can approve as it requires.
export const isCertificateActionRequestUndecidable = (
  { currentStep, steps }: { currentStep: number; steps: TCertificateActionRequestStep[] },
  people: TApprovingPeople
) =>
  steps.some((step) => {
    if (step.stepNumber < currentStep) return false;
    const canApprove = findPeopleWhoCanApprove(step.approvers, people);
    if (step.stepNumber > currentStep) return canApprove.size < step.requiredApprovals;

    const voted = new Set(step.approvals.map((approval) => approval.approverUserId));
    const yetToVote = [...canApprove].filter((userId) => !voted.has(userId)).length;
    return yetToVote < step.requiredApprovals - voted.size;
  });
