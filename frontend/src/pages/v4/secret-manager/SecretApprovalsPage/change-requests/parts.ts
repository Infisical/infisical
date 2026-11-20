import type { BadgeTone } from "@infisical/cipher/ui/badge";

import { ApprovalStatus, CommitType } from "@app/hooks/api/secretApprovalRequest/types";
import type { TSecretApprovalRequest } from "@app/hooks/api/secretApprovalRequest/types";
import { formatReservedPaths, parsePathFromReplicatedPath } from "@app/lib/fn/string";

export type ChangeRequest = TSecretApprovalRequest;
type Person = { firstName?: string; lastName?: string; email: string };

export const personName = ({ firstName, lastName, email }: Person) =>
  [firstName, lastName].filter(Boolean).join(" ") || email;

export const authorName = (request: ChangeRequest) => {
  if (request.committerUser) return personName(request.committerUser);
  return request.committerIdentity?.name ?? "Deleted user";
};

export const pathOf = (request: ChangeRequest) =>
  request.isReplicated
    ? parsePathFromReplicatedPath(request.secretPath)
    : formatReservedPaths(request.secretPath);

export const approvedCount = ({ policy, reviewers }: ChangeRequest) =>
  policy.approvers.filter(({ userId }) =>
    reviewers.some(
      (reviewer) => reviewer.userId === userId && reviewer.status === ApprovalStatus.APPROVED
    )
  ).length;

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const verbs: Record<CommitType, string> = {
  [CommitType.CREATE]: "added",
  [CommitType.ADD]: "added",
  [CommitType.UPDATE]: "updated",
  [CommitType.DELETE]: "deleted"
};

export const changeTitle = ({ commits }: { commits: { op: CommitType }[] }) => {
  const found = new Set(commits.map(({ op }) => verbs[op]));
  if (found.size === 1) return `${plural(commits.length, "secret")} ${[...found][0]}`;
  return plural(commits.length, "secret change");
};

export const reviewStatus: Record<
  ApprovalStatus,
  { label: string; tone: BadgeTone; icon: "check-c" | "x" | "clock" }
> = {
  [ApprovalStatus.APPROVED]: { label: "Approved", tone: "ok", icon: "check-c" },
  [ApprovalStatus.REJECTED]: { label: "Rejected", tone: "bad", icon: "x" },
  [ApprovalStatus.PENDING]: { label: "Pending", tone: "warn", icon: "clock" },
  [ApprovalStatus.REVOKED]: { label: "Pending", tone: "warn", icon: "clock" }
};
