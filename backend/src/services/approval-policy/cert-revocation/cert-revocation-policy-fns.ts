import { ApproverType } from "../approval-policy-enums";

export type TApproverEntry = { type: ApproverType; id: string };

export enum RevocationStepShortfallKind {
  NoApprovers = "no-approvers",
  TooFewApprovers = "too-few-approvers"
}

export type TRevocationStepShortfall =
  | { kind: RevocationStepShortfallKind.NoApprovers }
  | { kind: RevocationStepShortfallKind.TooFewApprovers; requiredApprovals: number; approverCount: number };

export const getRevocationStepShortfall = ({
  requiredApprovals,
  approverCount
}: {
  requiredApprovals: number;
  approverCount: number;
}): TRevocationStepShortfall | null => {
  if (approverCount === 0) return { kind: RevocationStepShortfallKind.NoApprovers };
  if (requiredApprovals > approverCount) {
    return { kind: RevocationStepShortfallKind.TooFewApprovers, requiredApprovals, approverCount };
  }
  return null;
};

export const formatApproverCount = (count: number) => `${count} approver${count === 1 ? "" : "s"}`;

export const approverKey = (approver: TApproverEntry) => `${approver.type}:${approver.id}`;

// The users who can approve through each approver entry, keyed by approverKey.
export type TApprovingPeople = Map<string, Set<string>>;

export const findPeopleWhoCanApprove = (approvers: TApproverEntry[], people: TApprovingPeople) =>
  new Set(approvers.flatMap((approver) => [...(people.get(approverKey(approver)) ?? [])]));

export type TRevocationRequestStep = {
  stepNumber: number;
  requiredApprovals: number;
  approvers: TApproverEntry[];
  approvals: { approverUserId: string }[];
};

// A rejection ends a request, so every vote on the step in progress is an approval, and each person votes once. The
// step can still pass while the people who can approve and haven't voted cover the approvals it still needs, and a
// later step while it has as many people who can approve as it requires.
export const isRevocationRequestUndecidable = (
  { currentStep, steps }: { currentStep: number; steps: TRevocationRequestStep[] },
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
