import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { apiRequest } from "@app/config/request";

import { dashboardKeys } from "../dashboard/queries";
import { commitKeys } from "../folderCommits/queries";
import { secretKeys } from "../secrets/queries";
import { secretApprovalRequestKeys } from "./queries";
import {
  ApprovalStatus,
  BulkChangeRequestAction,
  TBulkActOnSecretApprovalRequestsDTO,
  TBulkChangeRequestResult,
  TPerformSecretApprovalRequestMerge,
  TSecretApprovalRequest,
  TUpdateSecretApprovalRequestStatusDTO,
  TUpdateSecretApprovalReviewStatusDTO
} from "./types";

export const useUpdateSecretApprovalReviewStatus = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateSecretApprovalReviewStatusDTO>({
    mutationFn: async ({ id, status, comment }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-approval-requests/${id}/review`, {
        status,
        comment
      });
      return data;
    },
    onSuccess: (_, { id, projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.detail({ id }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
    }
  });
};

export const useUpdateSecretApprovalRequestStatus = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateSecretApprovalRequestStatusDTO>({
    mutationFn: async ({ id, status }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-approval-requests/${id}/status`, {
        status
      });
      return data;
    },
    onSuccess: (_, { id, projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.detail({ id }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
    }
  });
};

export const usePerformSecretApprovalRequestMerge = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TPerformSecretApprovalRequestMerge>({
    mutationFn: async ({ id, bypassReason }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-approval-requests/${id}/merge`, {
        bypassReason
      });
      return data;
    },
    onSuccess: (_, { id, projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.detail({ id }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
    }
  });
};

type TBatchFailure = { approvalRequestId: string; message: string };
type TBatchResponse = {
  failures: TBatchFailure[];
  approvals?: Pick<TSecretApprovalRequest, "id" | "hasMerged" | "conflicts">[];
  reviews?: {
    requestId: string;
    reviewerUserId: string;
    status: ApprovalStatus;
    comment?: string | null;
  }[];
};

export const useBulkActOnSecretApprovalRequests = () => {
  const queryClient = useQueryClient();

  return useMutation<TBulkChangeRequestResult[], object, TBulkActOnSecretApprovalRequestsDTO>({
    mutationFn: async ({ action, comment, requestIds }) => {
      let failures: TBatchFailure[];
      try {
        const { data } =
          action === BulkChangeRequestAction.Merge
            ? await apiRequest.post<TBatchResponse>(
                "/api/v1/secret-approval-requests/batch/merge",
                { approvalRequestIds: requestIds }
              )
            : await apiRequest.post<TBatchResponse>(
                "/api/v1/secret-approval-requests/batch/review",
                {
                  approvalRequestIds: requestIds,
                  status:
                    action === BulkChangeRequestAction.Approve
                      ? ApprovalStatus.APPROVED
                      : ApprovalStatus.REJECTED,
                  comment
                }
              );
        failures = data.failures;
        data.approvals?.forEach(({ id, hasMerged, conflicts }) =>
          queryClient.setQueryData<TSecretApprovalRequest>(
            secretApprovalRequestKeys.detail({ id }),
            (details) => details && { ...details, hasMerged, conflicts }
          )
        );
        data.reviews?.forEach(({ requestId, reviewerUserId, status, comment: reviewComment }) =>
          queryClient.setQueryData<TSecretApprovalRequest>(
            secretApprovalRequestKeys.detail({ id: requestId }),
            (details) => {
              if (!details) return details;
              const reviewer =
                details.reviewers.find(({ userId }) => userId === reviewerUserId) ??
                details.policy.approvers.find(({ userId }) => userId === reviewerUserId);
              if (!reviewer) return details;
              return {
                ...details,
                reviewers: [
                  ...details.reviewers.filter(({ userId }) => userId !== reviewerUserId),
                  { createdAt: new Date(), ...reviewer, status, comment: reviewComment ?? "" }
                ]
              };
            }
          )
        );
      } catch (error) {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (!status || status >= 500) throw error;
        const message = isAxiosError(error) ? error.response?.data?.message : undefined;
        return requestIds.map((id) => ({
          id,
          isSuccess: false,
          errorMessage:
            typeof message === "string"
              ? message
              : "Could not update this change request. Try again or open it for details."
        }));
      }
      const failureById = new Map(
        failures.map(({ approvalRequestId, message }) => [approvalRequestId, message])
      );
      return requestIds.map((id) =>
        failureById.has(id)
          ? { id, isSuccess: false, errorMessage: failureById.get(id) }
          : { id, isSuccess: true }
      );
    },
    onSettled: (results, error, { projectId, action, requestIds }) => {
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      requestIds.forEach((id) =>
        queryClient.invalidateQueries({
          queryKey: secretApprovalRequestKeys.detail({ id }),
          refetchType: error ? "active" : "none"
        })
      );

      if (
        action !== BulkChangeRequestAction.Merge ||
        !(error || results?.some(({ isSuccess }) => isSuccess))
      )
        return;

      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          [
            "secrets",
            "folder-commits",
            "folder-commits-count",
            "secrets-import-sec",
            "imported-folders-all-envs"
          ].includes(query.queryKey[1] as string)
      });
    }
  });
};
