import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { accessApprovalKeys } from "./queries";
import { TCreateAccessPolicyDTO, TDeleteSecretPolicyDTO, TUpdateAccessPolicyDTO } from "./types";

export const useCreateAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateAccessPolicyDTO>({
    mutationFn: async ({ environment, workspaceId, approvals, approvers, name }) => {
      const { data } = await apiRequest.post("/api/v1/access-approvals", {
        environment,
        workspaceId,
        approvals,
        approvers,
        name
      });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalPolicies(workspaceId));
    }
  });
};

export const useUpdateAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateAccessPolicyDTO>({
    mutationFn: async ({ id, approvers, approvals, name }) => {
      const { data } = await apiRequest.patch(`/api/v1/access-approvals/${id}`, {
        approvals,
        approvers,
        name
      });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalPolicies(workspaceId));
    }
  });
};

export const useDeleteAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretPolicyDTO>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.delete(`/api/v1/access-approvals/${id}`);
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalPolicies(workspaceId));
    }
  });
};
