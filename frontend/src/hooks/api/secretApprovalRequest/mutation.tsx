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

  return useMutation<{}, {}, TUpdateSecretApprovalReviewStatusDTO>({
    mutationFn: async ({ id, status }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-approval-requests/${id}/review`, {
        status
      });
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(secretApprovalRequestKeys.detail({ id }));
    }
  });
};

export const useUpdateSecretApprovalRequestStatus = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSecretApprovalRequestStatusDTO>({
    mutationFn: async ({ id, status }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-approval-requests/${id}/status`, {
        status
      });
      return data;
    },
    onSuccess: (_, { id, workspaceId }) => {
      queryClient.invalidateQueries(secretApprovalRequestKeys.detail({ id }));
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    }
  });
};

export const usePerformSecretApprovalRequestMerge = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TPerformSecretApprovalRequestMerge>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-approval-requests/${id}/merge`);
      return data;
    },
    onSuccess: (_, { id, workspaceId }) => {
      queryClient.invalidateQueries(secretApprovalRequestKeys.detail({ id }));
      queryClient.invalidateQueries(secretApprovalRequestKeys.list({ workspaceId }));
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    }
  });
};
