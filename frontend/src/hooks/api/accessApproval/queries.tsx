import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TProjectPermission } from "../roles/types";
import {
  TAccessApprovalPolicy,
  TAccessApprovalRequest,
  TAccessRequestCount,
  TGetAccessApprovalRequestsDTO,
  TGetAccessPolicyApprovalCountDTO
} from "./types";

export const accessApprovalKeys = {
  getAccessApprovalPolicies: (projectSlug: string) =>
    [{ projectSlug }, "access-approval-policies"] as const,
  getAccessApprovalPolicyOfABoard: (workspaceId: string, environment: string) =>
    [{ workspaceId, environment }, "access-approval-policy"] as const,

  getAccessApprovalRequests: (projectSlug: string, envSlug?: string, requestedBy?: string) =>
    [{ projectSlug, envSlug, requestedBy }, "access-approvals-requests"] as const,
  getAccessApprovalRequestCount: (projectSlug: string) =>
    [{ projectSlug }, "access-approval-request-count"] as const
};

export const fetchPolicyApprovalCount = async ({
  projectSlug,
  envSlug
}: TGetAccessPolicyApprovalCountDTO) => {
  const { data } = await apiRequest.get<{ count: number }>(
    "/api/v1/access-approvals/policies/count",
    {
      params: { projectSlug, envSlug }
    }
  );
  return data.count;
};

export const useGetAccessPolicyApprovalCount = ({
  projectSlug,
  envSlug,
  options = {}
}: TGetAccessPolicyApprovalCountDTO & {
  options?: UseQueryOptions<
    number,
    unknown,
    number,
    ReturnType<typeof accessApprovalKeys.getAccessApprovalPolicies>
  >;
}) =>
  useQuery({
    queryFn: () => fetchPolicyApprovalCount({ projectSlug, envSlug }),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true)
  });

const fetchApprovalPolicies = async ({ projectSlug }: TGetAccessApprovalRequestsDTO) => {
  const { data } = await apiRequest.get<{ approvals: TAccessApprovalPolicy[] }>(
    "/api/v1/access-approvals/policies",
    { params: { projectSlug } }
  );
  return data.approvals;
};

const fetchApprovalRequests = async ({
  projectSlug,
  envSlug,
  authorUserId
}: TGetAccessApprovalRequestsDTO) => {
  const { data } = await apiRequest.get<{ requests: TAccessApprovalRequest[] }>(
    "/api/v1/access-approvals/requests",
    { params: { projectSlug, envSlug, authorUserId } }
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

const fetchAccessRequestsCount = async (projectSlug: string) => {
  const { data } = await apiRequest.get<TAccessRequestCount>(
    "/api/v1/access-approvals/requests/count",
    { params: { projectSlug } }
  );
  return data;
};

export const useGetAccessRequestsCount = ({
  projectSlug,
  options = {}
}: TGetAccessApprovalRequestsDTO & {
  options?: UseQueryOptions<
    TAccessRequestCount,
    unknown,
    { pendingCount: number; finalizedCount: number },
    ReturnType<typeof accessApprovalKeys.getAccessApprovalRequestCount>
  >;
}) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalRequestCount(projectSlug),
    queryFn: () => fetchAccessRequestsCount(projectSlug),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true)
  });

export const useGetAccessApprovalPolicies = ({
  projectSlug,
  envSlug,
  authorUserId,
  options = {}
}: TGetAccessApprovalRequestsDTO & {
  options?: UseQueryOptions<
    TAccessApprovalPolicy[],
    unknown,
    TAccessApprovalPolicy[],
    ReturnType<typeof accessApprovalKeys.getAccessApprovalPolicies>
  >;
}) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalPolicies(projectSlug),
    queryFn: () => fetchApprovalPolicies({ projectSlug, envSlug, authorUserId }),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true)
  });

export const useGetAccessApprovalRequests = ({
  projectSlug,
  envSlug,
  authorUserId,
  options = {}
}: TGetAccessApprovalRequestsDTO & {
  options?: UseQueryOptions<
    TAccessApprovalRequest[],
    unknown,
    TAccessApprovalRequest[],
    ReturnType<typeof accessApprovalKeys.getAccessApprovalRequests>
  >;
}) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalRequests(projectSlug, envSlug, authorUserId),
    queryFn: () => fetchApprovalRequests({ projectSlug, envSlug, authorUserId }),
    ...options,
    enabled: Boolean(projectSlug) && (options?.enabled ?? true)
  });
