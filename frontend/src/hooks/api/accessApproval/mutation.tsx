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

  return useMutation<{}, {}, TCreateAccessPolicyDTO>({
    mutationFn: async ({
      environment,
      projectSlug,
      approvals,
      approverUserIds,
      name,
      secretPath,
      enforcementLevel
    }) => {
      const { data } = await apiRequest.post("/api/v1/access-approvals/policies", {
        environment,
        projectSlug,
        approvals,
        approverUserIds,
        secretPath,
        name,
        enforcementLevel
      });
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalPolicies(projectSlug));
    }
  });
};

export const useUpdateAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateAccessPolicyDTO>({
    mutationFn: async ({ id, approvers, approvals, name, secretPath, enforcementLevel }) => {
      const { data } = await apiRequest.patch(`/api/v1/access-approvals/policies/${id}`, {
        approvals,
        approvers,
        secretPath,
        name,
        enforcementLevel
      });
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalPolicies(projectSlug));
    }
  });
};

export const useDeleteAccessApprovalPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretPolicyDTO>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.delete(`/api/v1/access-approvals/policies/${id}`);
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalPolicies(projectSlug));
    }
  });
};

export const useCreateAccessRequest = () => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TCreateAccessRequestDTO>({
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
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalRequestCount(projectSlug));
    }
  });
};

export const useReviewAccessRequest = () => {
  const queryClient = useQueryClient();
  return useMutation<
    {},
    {},
    {
      requestId: string;
      status: "approved" | "rejected";
      projectSlug: string;
      envSlug?: string;
      requestedBy?: string;
    }
  >({
    mutationFn: async ({ requestId, status }) => {
      const { data } = await apiRequest.post(
        `/api/v1/access-approvals/requests/${requestId}/review`,
        {
          status
        }
      );
      return data;
    },
    onSuccess: (_, { projectSlug, envSlug, requestedBy }) => {
      queryClient.invalidateQueries(
        accessApprovalKeys.getAccessApprovalRequests(projectSlug, envSlug, requestedBy)
      );
      queryClient.invalidateQueries(accessApprovalKeys.getAccessApprovalRequestCount(projectSlug));
    }
  });
};
