import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.detail({ id }) });
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
    onSuccess: (_, { id, workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.detail({ id }) });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
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
    onSuccess: (_, { id, workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.detail({ id }) });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.list({ workspaceId }) });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
    }
  });
};
