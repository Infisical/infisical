import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

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

export const useBulkActOnSecretApprovalRequests = () => {
  const queryClient = useQueryClient();

  return useMutation<TBulkChangeRequestResult[], object, TBulkActOnSecretApprovalRequestsDTO>({
    mutationFn: async ({ action, comment, requestIds }) => {
      const results: TBulkChangeRequestResult[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const id of requestIds) {
        try {
          if (action === BulkChangeRequestAction.Merge) {
            // eslint-disable-next-line no-await-in-loop
            await apiRequest.post(`/api/v1/secret-approval-requests/${id}/merge`, {
              requireApprovals: true
            });
          } else {
            // eslint-disable-next-line no-await-in-loop
            await apiRequest.post(`/api/v1/secret-approval-requests/${id}/review`, {
              status:
                action === BulkChangeRequestAction.Approve
                  ? ApprovalStatus.APPROVED
                  : ApprovalStatus.REJECTED,
              comment
            });
          }
          results.push({ id, isSuccess: true });
        } catch (error) {
          const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
          results.push({
            id,
            isSuccess: false,
            errorMessage:
              typeof message === "string"
                ? message
                : "Could not update this change request. Try again or open it for details."
          });
        }
      }

      return results;
    },
    onSuccess: (results, { projectId, action }) => {
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      results.forEach(({ id }) =>
        queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.detail({ id }) })
      );

      if (action !== BulkChangeRequestAction.Merge || !results.some(({ isSuccess }) => isSuccess))
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
