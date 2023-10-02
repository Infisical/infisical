import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretApprovalRequestKeys } from "./queries";
import { TPerformSecretApprovalRequestMerge, TUpdateSecretApprovalRequestStatusDTO } from "./types";

export const useUpdateSecretApprovalRequestStatus = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSecretApprovalRequestStatusDTO>({
    mutationFn: async ({ id, status }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-approval-requests/${id}`, { status });
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(secretApprovalRequestKeys.detail({ id }));
    }
  });
};

export const usePerformSecretApprovalRequestMerge = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TPerformSecretApprovalRequestMerge>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.post("/api/v1/secret-approval-requests/merge", { id });
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(secretApprovalRequestKeys.detail({ id }));
    }
  });
};
