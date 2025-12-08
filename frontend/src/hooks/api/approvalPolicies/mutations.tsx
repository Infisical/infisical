import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { approvalPolicyQuery } from "./queries";
import {
  TApprovalPolicy,
  TCreateApprovalPolicyDTO,
  TDeleteApprovalPolicyDTO,
  TUpdateApprovalPolicyDTO
} from "./types";

export const useCreateApprovalPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, ...dto }: TCreateApprovalPolicyDTO) => {
      const { data } = await apiRequest.post<{ policy: TApprovalPolicy }>(
        `/api/v1/approval-policies/${policyType}`,
        dto
      );
      return data.policy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalPolicyQuery.allKey() });
    }
  });
};

export const useUpdateApprovalPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, policyId, ...updates }: TUpdateApprovalPolicyDTO) => {
      const { data } = await apiRequest.patch<{ policy: TApprovalPolicy }>(
        `/api/v1/approval-policies/${policyType}/${policyId}`,
        updates
      );
      return data.policy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalPolicyQuery.allKey() });
    }
  });
};

export const useDeleteApprovalPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, policyId }: TDeleteApprovalPolicyDTO) => {
      const { data } = await apiRequest.delete<{ policyId: string }>(
        `/api/v1/approval-policies/${policyType}/${policyId}`
      );
      return data.policyId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalPolicyQuery.allKey() });
    }
  });
};
