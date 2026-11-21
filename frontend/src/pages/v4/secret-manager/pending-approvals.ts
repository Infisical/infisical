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
 * The list returns one entry per vote with no step attached. Steps are approved in order and each
 * takes one vote per approver, so an approver's votes fill their own steps in sequence.
 */
export const accessNeedsReview = (request: TAccessApprovalRequest, userId: string) => {
  if (!accessIsOpen(request) || request.delegatedApproval) return false;
  if (request.requestedByUserId === userId && !request.policy.allowedSelfApprovals) return false;
  const { approvers } = request.policy;
  const stepOfApprover = (approver: (typeof approvers)[number]) => approver.sequence || 1;
  const steps = [...new Set(approvers.map(stepOfApprover))].sort((x, y) => x - y);
  const stepsOf = (id: string) =>
    steps.filter((step) =>
      approvers.some((approver) => approver.userId === id && stepOfApprover(approver) === step)
    );
  const cast = new Map<string, number>();
  const votes = new Map<number, number>();
  request.reviewers
    .filter((reviewer) => reviewer.status === ApprovalStatus.APPROVED)
    .forEach((reviewer) => {
      const count = cast.get(reviewer.userId) ?? 0;
      cast.set(reviewer.userId, count + 1);
      const step = stepsOf(reviewer.userId)[count];
      if (step !== undefined) votes.set(step, (votes.get(step) ?? 0) + 1);
    });
  const inProgress = steps.find((step) => {
    const required =
      approvers.find((approver) => stepOfApprover(approver) === step)?.approvalsRequired ||
      request.policy.approvals ||
      1;
    return (votes.get(step) ?? 0) < required;
  });
  if (inProgress === undefined) return false;
  return stepsOf(userId).indexOf(inProgress) >= (cast.get(userId) ?? 0);
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
