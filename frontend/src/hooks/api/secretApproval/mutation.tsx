import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretApprovalKeys } from "./queries";
import { TCreateSecretPolicyDTO, TDeleteSecretPolicyDTO, TUpdateSecretPolicyDTO } from "./types";

export const useCreateSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateSecretPolicyDTO>({
    mutationFn: async ({
      environments,
      projectId,
      approvals,
      approvers,
      bypassers,
      secretPath,
      name,
      enforcementLevel,
      allowedSelfApprovals
    }) => {
      const { data } = await apiRequest.post("/api/v2/secret-approvals", {
        environments,
        projectId,
        approvals,
        approvers,
        bypassers,
        secretPath,
        name,
        enforcementLevel,
        allowedSelfApprovals
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: secretApprovalKeys.getApprovalPolicies(projectId)
      });
    }
  });
};

export const useUpdateSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateSecretPolicyDTO>({
    mutationFn: async ({
      id,
      approvers,
      bypassers,
      approvals,
      secretPath,
      name,
      enforcementLevel,
      allowedSelfApprovals,
      environments
    }) => {
      const { data } = await apiRequest.patch(`/api/v2/secret-approvals/${id}`, {
        approvals,
        approvers,
        bypassers,
        secretPath,
        name,
        enforcementLevel,
        allowedSelfApprovals,
        environments
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: secretApprovalKeys.getApprovalPolicies(projectId)
      });
    }
  });
};

export const useDeleteSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteSecretPolicyDTO>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.delete(`/api/v2/secret-approvals/${id}`);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: secretApprovalKeys.getApprovalPolicies(projectId)
      });
    }
  });
};
