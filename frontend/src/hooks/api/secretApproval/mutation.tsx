import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretApprovalKeys } from "./queries";
import { TCreateSecretPolicyDTO, TDeleteSecretPolicyDTO, TUpdateSecretPolicyDTO } from "./types";

export const useCreateSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateSecretPolicyDTO>({
    mutationFn: async ({ environment, workspaceId, approvals, approvers, secretPath, name }) => {
      const { data } = await apiRequest.post("/api/v1/secret-approvals", {
        environment,
        workspaceId,
        approvals,
        approvers,
        secretPath,
        name
      });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(secretApprovalKeys.getApprovalPolicies(workspaceId));
    }
  });
};

export const useUpdateSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSecretPolicyDTO>({
    mutationFn: async ({ id, approvers, approvals, secretPath, name }) => {
      const { data } = await apiRequest.patch(`/api/v1/secret-approvals/${id}`, {
        approvals,
        approvers,
        secretPath,
        name
      });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(secretApprovalKeys.getApprovalPolicies(workspaceId));
    }
  });
};

export const useDeleteSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretPolicyDTO>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.delete(`/api/v1/secret-approvals/${id}`);
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(secretApprovalKeys.getApprovalPolicies(workspaceId));
    }
  });
};
