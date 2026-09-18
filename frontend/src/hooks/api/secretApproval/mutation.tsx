import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretApprovalRequestKeys } from "../secretApprovalRequest/queries";
import { ApiErrorTypes } from "../types";
import { secretApprovalKeys } from "./queries";
import { TCreateSecretPolicyDTO, TDeleteSecretPolicyDTO, TUpdateSecretPolicyDTO } from "./types";

export const useCreateSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateSecretPolicyDTO>({
    meta: { handledErrorCodes: [ApiErrorTypes.BadRequestError] },
    mutationFn: async ({
      environments,
      projectId,
      approvals,
      approvers,
      bypassers,
      secretPath,
      name,
      enforcementLevel,
      allowedSelfApprovals,
      bypassForMachineIdentities
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
        allowedSelfApprovals,
        bypassForMachineIdentities
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: secretApprovalKeys.getApprovalPolicies(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ projectId })
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[1] === "secret-approval-request-detail"
      });
    }
  });
};

export const useUpdateSecretApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateSecretPolicyDTO>({
    meta: { handledErrorCodes: [ApiErrorTypes.BadRequestError] },
    mutationFn: async ({
      id,
      approvers,
      bypassers,
      approvals,
      secretPath,
      name,
      enforcementLevel,
      allowedSelfApprovals,
      bypassForMachineIdentities,
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
        bypassForMachineIdentities,
        environments
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: secretApprovalKeys.getApprovalPolicies(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ projectId })
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[1] === "secret-approval-request-detail"
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
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ projectId })
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[1] === "secret-approval-request-detail"
      });
    }
  });
};
