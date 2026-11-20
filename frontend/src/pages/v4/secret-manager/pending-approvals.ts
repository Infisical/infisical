import type { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import {
  ApprovalStatus,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { getAccessRequestState } from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/AccessApprovalRequest.utils";

import { useV4Adapter } from "../data/adapters";
import { useV4Session } from "../data/session/contract";

const approved = (reviewers: { status: string }[]) =>
  reviewers.filter((reviewer) => reviewer.status === ApprovalStatus.APPROVED).length;

const changeIsOpen = (request: TSecretApprovalRequest) =>
  request.status === "open" &&
  !request.hasMerged &&
  !request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED);

/** Secret change policies have one step, so the step in progress is the policy itself. */
const changeNeedsReview = (request: TSecretApprovalRequest, userId: string) =>
  changeIsOpen(request) &&
  approved(request.reviewers) < request.policy.approvals &&
  request.policy.approvers.some((approver) => approver.userId === userId) &&
  !request.reviewers.some((reviewer) => reviewer.userId === userId) &&
  !(request.committerUserId === userId && request.policy.allowedSelfApprovals === false);

const accessIsOpen = (request: TAccessApprovalRequest) =>
  getAccessRequestState(request) === "pending" && !request.delegatedApproval;

const accessNeedsReview = (request: TAccessApprovalRequest, userId: string) => {
  if (!accessIsOpen(request)) return false;
  if (request.requestedByUserId === userId && !request.policy.allowedSelfApprovals) return false;
  if (request.reviewers.some((reviewer) => reviewer.userId === userId)) return false;
  const sequences = [
    ...new Set(request.policy.approvers.map((approver) => approver.sequence || 1))
  ].sort((a, b) => a - b);
  const current = sequences.find((sequence) => {
    const step = request.policy.approvers.filter(
      (approver) => (approver.sequence || 1) === sequence
    );
    const required = step[0]?.approvalsRequired || request.policy.approvals || 1;
    const stepApprovals = request.reviewers.filter(
      (reviewer) =>
        reviewer.status === ApprovalStatus.APPROVED &&
        step.some((approver) => approver.userId === reviewer.userId)
    ).length;
    return stepApprovals < required;
  });
  return request.policy.approvers.some(
    (approver) => (approver.sequence || 1) === current && approver.userId === userId
  );
};

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
  const project = secrets.useProject(projectId).data;
  const changes =
    secrets.useApprovalRequests({ projectId, status: "open", limit: 100 }).data?.approvals ?? [];
  const access =
    useV4Adapter("accessApprovals").useRequests({
      projectSlug: projectId ? (project?.slug ?? "") : ""
    }).data ?? [];
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
