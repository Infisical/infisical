import {
  TBulkChangeRequestResult,
  TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { ApprovalStatus } from "@app/hooks/api/types";

export type Outcome =
  | { status: "merged"; reviewError?: string }
  | { status: "rejected" }
  | { status: "awaiting" }
  | { status: "approved"; message: string }
  | { status: "failed"; message: string };

export const PENDING_APPROVALS_PATTERN = /needs \d+ approval\(s\)/;

export const isRequestApprovedByUser = ({
  request,
  details,
  userId
}: {
  request?: Pick<TSecretApprovalRequest, "reviewers">;
  details?: { reviewers?: { userId: string; status: ApprovalStatus }[] };
  userId?: string;
}): boolean => {
  if (!userId) return false;
  const reviewers = details?.reviewers ?? request?.reviewers ?? [];
  return reviewers.some(
    (reviewer) => reviewer.userId === userId && reviewer.status === ApprovalStatus.APPROVED
  );
};

export const filterRequestsNeedingApproval = ({
  approveIds,
  requests,
  detailsById,
  userId
}: {
  approveIds: string[];
  requests: TSecretApprovalRequest[];
  detailsById: Record<string, { reviewers?: { userId: string; status: ApprovalStatus }[] } | undefined>;
  userId?: string;
}): string[] => {
  return approveIds.filter((id) => {
    const request = requests.find((r) => r.id === id);
    return !isRequestApprovedByUser({ request, details: detailsById[id], userId });
  });
};

export const filterRequestsEligibleForMerge = ({
  approveIds,
  requests,
  detailsById,
  approveResults,
  userId
}: {
  approveIds: string[];
  requests: TSecretApprovalRequest[];
  detailsById: Record<string, { reviewers?: { userId: string; status: ApprovalStatus }[] } | undefined>;
  approveResults: TBulkChangeRequestResult[];
  userId?: string;
}): string[] => {
  return approveIds.filter((id) => {
    const request = requests.find((r) => r.id === id);
    if (isRequestApprovedByUser({ request, details: detailsById[id], userId })) {
      return true;
    }
    const review = approveResults.find((result) => result.id === id);
    return Boolean(review?.isSuccess);
  });
};

export const computeBulkReviewOutcomes = ({
  approveIds,
  requests,
  detailsById,
  rejectResults,
  approveResults,
  mergeResults,
  userId
}: {
  approveIds: string[];
  requests: TSecretApprovalRequest[];
  detailsById: Record<string, { reviewers?: { userId: string; status: ApprovalStatus }[] } | undefined>;
  rejectResults: TBulkChangeRequestResult[];
  approveResults: TBulkChangeRequestResult[];
  mergeResults: TBulkChangeRequestResult[];
  userId?: string;
}): Record<string, Outcome> => {
  const nextOutcomes: Record<string, Outcome> = {};

  rejectResults.forEach(({ id, isSuccess, errorMessage }) => {
    nextOutcomes[id] = isSuccess
      ? { status: "rejected" }
      : { status: "failed", message: errorMessage ?? "Review failed" };
  });

  approveIds.forEach((id) => {
    const request = requests.find((r) => r.id === id);
    const wasAlreadyApproved = isRequestApprovedByUser({
      request,
      details: detailsById[id],
      userId
    });
    const review = approveResults.find((result) => result.id === id);
    const merge = mergeResults.find((result) => result.id === id);

    if (!wasAlreadyApproved && review && !review.isSuccess) {
      nextOutcomes[id] = {
        status: "failed",
        message: review.errorMessage ?? "Review failed"
      };
      return;
    }

    if (merge?.isSuccess) {
      nextOutcomes[id] = {
        status: "merged",
        reviewError: review && !review.isSuccess ? review.errorMessage : undefined
      };
      return;
    }

    if (merge && PENDING_APPROVALS_PATTERN.test(merge.errorMessage ?? "")) {
      nextOutcomes[id] = { status: "awaiting" };
      return;
    }

    nextOutcomes[id] = {
      status: "approved",
      message: merge?.errorMessage ?? "Could not be merged"
    };
  });

  return nextOutcomes;
};
