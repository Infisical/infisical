import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import { TProjectPermission } from "../roles/types";
import {
  TAccessApprovalPolicy,
  TAccessApprovalRequest,
  TAccessRequestCount,
  TGetAccessApprovalRequestsDTO,
  TGetAccessPolicyApprovalCountDTO
} from "./types";

export const accessApprovalKeys = {
  getAccessApprovalPolicies: (dto: TGetAccessApprovalRequestsDTO) =>
    ["access-approval-policies", dto] as const,
  getAccessApprovalPolicyOfABoard: (projectId: string, environment: string) =>
    [{ projectId, environment }, "access-approval-policy"] as const,

  getAccessApprovalRequests: (dto: TGetAccessApprovalRequestsDTO) =>
    ["access-approvals-requests", dto] as const,
  getAccessApprovalRequestCount: (dto: TGetAccessPolicyApprovalCountDTO) =>
    ["access-approval-request-count", dto] as const
};

export const fetchPolicyApprovalCount = async ({
  projectSlug,
  envSlug,
  namespaceId
}: TGetAccessPolicyApprovalCountDTO) => {
  const { data } = await apiRequest.get<{ count: number }>(
    "/api/v1/access-approvals/policies/count",
    {
      params: { projectSlug, envSlug, namespaceId }
    }
  );
  return data.count;
};

export const useGetAccessPolicyApprovalCount = ({
  projectSlug,
  namespaceId,
  envSlug,
  options = {}
}: TGetAccessPolicyApprovalCountDTO & TReactQueryOptions) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalRequestCount({
      namespaceId,
      projectSlug,
      envSlug
    }),
    queryFn: () => fetchPolicyApprovalCount({ projectSlug, envSlug, namespaceId }),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true)
  });

const fetchApprovalPolicies = async ({
  projectSlug,
  namespaceId
}: TGetAccessApprovalRequestsDTO) => {
  const { data } = await apiRequest.get<{ approvals: TAccessApprovalPolicy[] }>(
    "/api/v1/access-approvals/policies",
    { params: { projectSlug, namespaceId } }
  );
  return data.approvals;
};

const fetchApprovalRequests = async ({
  projectSlug,
  envSlug,
  authorUserId,
  namespaceId
}: TGetAccessApprovalRequestsDTO) => {
  const { data } = await apiRequest.get<{ requests: TAccessApprovalRequest[] }>(
    "/api/v1/access-approvals/requests",
    { params: { projectSlug, envSlug, authorUserId, namespaceId } }
  );

  return data.requests.map((request) => ({
    ...request,

    privilege: request.privilege
      ? {
          ...request.privilege,
          permissions: unpackRules(
            request.privilege.permissions as unknown as PackRule<TProjectPermission>[]
          )
        }
      : null,
    permissions: unpackRules(request.permissions as unknown as PackRule<TProjectPermission>[])
  }));
};

const fetchAccessRequestsCount = async (params: {
  projectSlug: string;
  policyId?: string;
  namespaceId?: string;
}) => {
  const { data } = await apiRequest.get<TAccessRequestCount>(
    "/api/v1/access-approvals/requests/count",
    { params }
  );
  return data;
};

export const useGetAccessRequestsCount = ({
  projectSlug,
  policyId,
  namespaceId,
  envSlug,
  options = {}
}: TGetAccessApprovalRequestsDTO & TReactQueryOptions) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalRequestCount({
      namespaceId,
      projectSlug,
      envSlug: envSlug || ""
    }),
    queryFn: () => fetchAccessRequestsCount({ projectSlug, namespaceId, policyId }),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true)
  });

export const useGetAccessApprovalPolicies = ({
  projectSlug,
  envSlug,
  authorUserId,
  options = {},
  namespaceId
}: TGetAccessApprovalRequestsDTO & TReactQueryOptions) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalPolicies({
      projectSlug,
      envSlug,
      namespaceId,
      authorUserId
    }),
    queryFn: () => fetchApprovalPolicies({ namespaceId, envSlug, projectSlug, authorUserId }),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true)
  });

export const useGetAccessApprovalRequests = ({
  projectSlug,
  envSlug,
  authorUserId,
  namespaceId,
  options = {}
}: TGetAccessApprovalRequestsDTO & TReactQueryOptions) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalRequests({
      authorUserId,
      projectSlug,
      envSlug,
      namespaceId
    }),
    queryFn: () => fetchApprovalRequests({ projectSlug, envSlug, authorUserId, namespaceId }),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true),
    placeholderData: (previousData) => previousData
  });
