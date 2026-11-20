import type { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import {
  ApprovalStatus,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { getAccessRequestState } from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/AccessApprovalRequest.utils";

import { useV4Adapter } from "../data/adapters";
import type { V4QueryResult } from "../data/contract";
import { useV4Session } from "../data/session/contract";

const approved = (reviewers: { status: string }[]) =>
  reviewers.filter((reviewer) => reviewer.status === ApprovalStatus.APPROVED).length;

const changeIsOpen = (request: TSecretApprovalRequest) =>
  request.status === "open" && !request.hasMerged;

/** Secret change policies have one step, so the step in progress is the policy itself. */
const changeNeedsReview = (request: TSecretApprovalRequest, userId: string) =>
  changeIsOpen(request) &&
  !request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED) &&
  approved(request.reviewers) < request.policy.approvals &&
  request.policy.approvers.some((approver) => approver.userId === userId) &&
  !request.reviewers.some((reviewer) => reviewer.userId === userId) &&
  !(request.committerUserId === userId && request.policy.allowedSelfApprovals === false);

const accessIsOpen = (request: TAccessApprovalRequest) =>
  getAccessRequestState(request) === "pending";

/**
 * The list returns one flat vote per reviewer, so a vote can only be tied to a step when no
 * approver sits in more than one step. Requests whose policy repeats an approver are not counted.
 */
const accessNeedsReview = (request: TAccessApprovalRequest, userId: string) => {
  if (!accessIsOpen(request) || request.delegatedApproval) return false;
  if (request.requestedByUserId === userId && !request.policy.allowedSelfApprovals) return false;
  const { approvers } = request.policy;
  const stepOfApprover = (approver: (typeof approvers)[number]) => approver.sequence || 1;
  const repeated = approvers.some((approver) =>
    approvers.some(
      (other) =>
        other.userId === approver.userId && stepOfApprover(other) !== stepOfApprover(approver)
    )
  );
  if (repeated) return false;
  const stepOf = new Map(
    approvers.flatMap((approver) =>
      approver.userId ? [[approver.userId, stepOfApprover(approver)] as const] : []
    )
  );
  const inProgress = [...new Set(stepOf.values())]
    .sort((a, b) => a - b)
    .find((sequence) => {
      const required =
        approvers.find((approver) => (approver.sequence || 1) === sequence)?.approvalsRequired ||
        request.policy.approvals ||
        1;
      const votes = request.reviewers.filter(
        (reviewer) =>
          reviewer.status === ApprovalStatus.APPROVED && stepOf.get(reviewer.userId) === sequence
      ).length;
      return votes < required;
    });
  return (
    inProgress !== undefined &&
    stepOf.get(userId) === inProgress &&
    !request.reviewers.some((reviewer) => reviewer.userId === userId)
  );
};

const current = <T>(query: V4QueryResult<T>) =>
  (query as { isPlaceholderData?: boolean }).isPlaceholderData ? undefined : query.data;

export type PendingApprovals = {
  changesToReview: number;
  accessToReview: number;
  changesMine: number;
  accessMine: number;
};

/** Open requests in a Secrets Management project that wait on the viewer, and the viewer's own. */
export const usePendingApprovals = (projectId: string): PendingApprovals => {
  const { user } = useV4Session();
  const secrets = useV4Adapter("secrets");
  const project = current(secrets.useProject(projectId));
  const changes =
    current(secrets.useApprovalRequests({ projectId, status: "open", limit: 100 }))?.approvals ??
    [];
  const access =
    current(
      useV4Adapter("accessApprovals").useRequests({
        projectSlug: projectId && project?.id === projectId ? project.slug : ""
      })
    ) ?? [];
  return {
    changesToReview: changes.filter((request) => changeNeedsReview(request, user.id)).length,
    accessToReview: access.filter((request) => accessNeedsReview(request, user.id)).length,
    changesMine: changes.filter(
      (request) => changeIsOpen(request) && request.committerUserId === user.id
    ).length,
    accessMine: access.filter(
      (request) => accessIsOpen(request) && request.requestedByUserId === user.id
    ).length
  };
};
