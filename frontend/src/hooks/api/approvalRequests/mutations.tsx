import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { approvalRequestQuery } from "./queries";
import {
  TApprovalRequest,
  TApproveApprovalRequestDTO,
  TCreateApprovalRequestDTO,
  TRejectApprovalRequestDTO
} from "./types";

export const useCreateApprovalRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, ...dto }: TCreateApprovalRequestDTO) => {
      const { data } = await apiRequest.post<{ request: TApprovalRequest }>(
        `/api/v1/approval-policies/${policyType}/requests`,
        dto
      );
      return data.request;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalRequestQuery.allKey() });
    }
  });
};

export const useApproveApprovalRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, requestId, comment }: TApproveApprovalRequestDTO) => {
      const { data } = await apiRequest.post<{ request: TApprovalRequest }>(
        `/api/v1/approval-policies/${policyType}/requests/${requestId}/approve`,
        { comment }
      );
      return data.request;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalRequestQuery.allKey() });
    }
  });
};

export const useRejectApprovalRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, requestId, comment }: TRejectApprovalRequestDTO) => {
      const { data } = await apiRequest.post<{ request: TApprovalRequest }>(
        `/api/v1/approval-policies/${policyType}/requests/${requestId}/reject`,
        { comment }
      );
      return data.request;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalRequestQuery.allKey() });
    }
  });
};
