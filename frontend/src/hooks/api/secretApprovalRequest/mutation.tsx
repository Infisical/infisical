import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { dashboardKeys } from "../dashboard/queries";
import { commitKeys } from "../folderCommits/queries";
import { secretKeys } from "../secrets/queries";
import { secretSnapshotKeys } from "../secretSnapshots/queries";
import { secretApprovalRequestKeys } from "./queries";
import {
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
        queryKey: secretSnapshotKeys.list({ environment, projectId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ environment, projectId, directory: secretPath })
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
