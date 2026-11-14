import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Inline } from "@infisical/cipher/ui/layout";

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

const changeKinds = [
  { ops: [CommitType.CREATE, CommitType.ADD], label: "Add", tone: "ok" },
  { ops: [CommitType.UPDATE], label: "Update", tone: "warn" },
  { ops: [CommitType.DELETE], label: "Delete", tone: "bad" }
] as const;

export const ChangeSummary = ({
  commits,
  isReplicated
}: {
  commits: { op: CommitType }[];
  isReplicated?: boolean;
}) => {
  if (isReplicated)
    return <Badge tone="info">{`${plural(commits.length, "secret")} pending import`}</Badge>;
  return (
    <Inline gap={4} wrap={false}>
      {changeKinds.map(({ ops, label, tone }) => {
        const count = commits.filter(({ op }) =>
          (ops as readonly CommitType[]).includes(op)
        ).length;
        return count ? (
          <Badge key={label} tone={tone}>
            {`${label} ${count}`}
          </Badge>
        ) : null;
      })}
    </Inline>
  );
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
