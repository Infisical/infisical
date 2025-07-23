import { packRules } from "@casl/ability/extra";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { accessApprovalKeys } from "./queries";
import {
  TAccessApproval,
  TCreateAccessPolicyDTO,
  TCreateAccessRequestDTO,
  TDeleteSecretPolicyDTO,
  TUpdateAccessPolicyDTO
} from "./types";

export const useCreateAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateAccessPolicyDTO>({
    mutationFn: async ({
      environments,
      projectSlug,
      approvals,
      approvers,
      bypassers,
      name,
      secretPath,
      enforcementLevel,
      allowedSelfApprovals,
      approvalsRequired
    }) => {
      const { data } = await apiRequest.post("/api/v1/access-approvals/policies", {
        environments,
        projectSlug,
        approvals,
        bypassers,
        approvers,
        secretPath,
        name,
        enforcementLevel,
        allowedSelfApprovals,
        approvalsRequired
      });
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: accessApprovalKeys.getAccessApprovalPolicies(projectSlug)
      });
    }
  });
};

export const useUpdateAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateAccessPolicyDTO>({
    mutationFn: async ({
      id,
      approvers,
      bypassers,
      approvals,
      name,
      secretPath,
      enforcementLevel,
      allowedSelfApprovals,
      approvalsRequired,
      environments
    }) => {
      const { data } = await apiRequest.patch(`/api/v1/access-approvals/policies/${id}`, {
        approvals,
        approvers,
        bypassers,
        secretPath,
        name,
        enforcementLevel,
        allowedSelfApprovals,
        approvalsRequired,
        environments
      });
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: accessApprovalKeys.getAccessApprovalPolicies(projectSlug)
      });
    }
  });
};

export const useDeleteAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteSecretPolicyDTO>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.delete(`/api/v1/access-approvals/policies/${id}`);
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: accessApprovalKeys.getAccessApprovalPolicies(projectSlug)
      });
    }
  });
};

export const useCreateAccessRequest = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, TCreateAccessRequestDTO>({
    mutationFn: async ({ projectSlug, ...request }) => {
      const { data } = await apiRequest.post<TAccessApproval>(
        "/api/v1/access-approvals/requests",
        {
          ...request,
          permissions: request.permissions ? packRules(request.permissions) : undefined
        },
        {
          params: {
            projectSlug
          }
        }
      );

      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: accessApprovalKeys.getAccessApprovalRequestCount(projectSlug)
      });
    }
  });
};

export const useReviewAccessRequest = () => {
  const queryClient = useQueryClient();
  return useMutation<
    object,
    object,
    {
      requestId: string;
      status: "approved" | "rejected";
      projectSlug: string;
      envSlug?: string;
      requestedBy?: string;
      bypassReason?: string;
    }
  >({
    mutationFn: async ({ requestId, status, bypassReason }) => {
      const { data } = await apiRequest.post(
        `/api/v1/access-approvals/requests/${requestId}/review`,
        {
          status,
          bypassReason
        }
      );
      return data;
    },
    onSuccess: (_, { projectSlug, envSlug, requestedBy, bypassReason }) => {
      queryClient.invalidateQueries({
        queryKey: accessApprovalKeys.getAccessApprovalRequests(
          projectSlug,
          envSlug,
          requestedBy,
          bypassReason
        )
      });
      queryClient.invalidateQueries({
        queryKey: accessApprovalKeys.getAccessApprovalRequestCount(projectSlug)
      });
    }
  });
};
