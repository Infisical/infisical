import { TSecretApprovalRequest } from "@app/hooks/api/secretApprovalRequest/types";
import { ApprovalStatus } from "@app/hooks/api/types";

export const isChangeRequestMergeable = ({ reviewers, policy }: TSecretApprovalRequest) =>
  reviewers.filter(({ status }) => status === ApprovalStatus.APPROVED).length >= policy.approvals;

export const doesChangeRequestNeedUserReview = (
  { policy, reviewers }: TSecretApprovalRequest,
  userId: string
) =>
  policy.approvers.some((approver) => approver.userId === userId) &&
  !reviewers.some((reviewer) => reviewer.userId === userId);
