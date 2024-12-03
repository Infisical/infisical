import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretApprovalKeys } from "./queries";
import { TCreateSecretPolicyDTO, TUpdateSecretPolicyDTO } from "./types";

export const useCreateSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateSecretPolicyDTO>({
    mutationFn: async ({
      environment,
      workspaceId,
      approvals,
      approvers,
      secretPath,
      name,
      enforcementLevel
    }) => {
      const { data } = await apiRequest.post("/api/v1/secret-approvals", {
        environment,
        workspaceId,
        approvals,
        approvers,
        secretPath,
        name,
        enforcementLevel
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
    mutationFn: async ({
      id,
      approvers,
      approvals,
      secretPath,
      name,
      enforcementLevel,
      disabled
    }) => {
      const { data } = await apiRequest.patch(`/api/v1/secret-approvals/${id}`, {
        approvals,
        approvers,
        secretPath,
        name,
        enforcementLevel,
        disabled
      });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(secretApprovalKeys.getApprovalPolicies(workspaceId));
    }
  });
};
