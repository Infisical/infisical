/* eslint-disable no-param-reassign */
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import {
  TGetSecretApprovalRequestCount,
  TGetSecretApprovalRequestDetails,
  TGetSecretApprovalRequestList,
  TSecretApprovalRequest,
  TSecretApprovalRequestCount
} from "./types";

export const secretApprovalRequestKeys = {
  list: ({
    workspaceId,
    environment,
    status,
    committer,
    offset,
    limit,
    search
  }: TGetSecretApprovalRequestList) =>
    [
      { workspaceId, environment, status, committer, offset, limit, search },
      "secret-approval-requests"
    ] as const,
  detail: ({ id }: Omit<TGetSecretApprovalRequestDetails, "decryptKey">) =>
    [{ id }, "secret-approval-request-detail"] as const,
  count: ({ workspaceId, policyId }: TGetSecretApprovalRequestCount) => [
    { workspaceId },
    "secret-approval-request-count",
    ...(policyId ? [policyId] : [])
  ]
};

const fetchSecretApprovalRequestList = async ({
  workspaceId,
  environment,
  committer,
  status = "open",
  limit = 20,
  offset = 0,
  search = ""
}: TGetSecretApprovalRequestList) => {
  const { data } = await apiRequest.get<{
    approvals: TSecretApprovalRequest[];
    totalCount: number;
  }>("/api/v1/secret-approval-requests", {
    params: {
      workspaceId,
      environment,
      committer,
      status,
      limit,
      offset,
      search
    }
  });

  return data;
};

export const useGetSecretApprovalRequests = ({
  workspaceId,
  environment,
  options = {},
  status,
  limit = 20,
  offset = 0,
  search,
  committer
}: TGetSecretApprovalRequestList & TReactQueryOptions) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.list({
      workspaceId,
      environment,
      committer,
      status,
      limit,
      search,
      offset
    }),
    queryFn: () =>
      fetchSecretApprovalRequestList({
        workspaceId,
        environment,
        status,
        committer,
        limit,
        offset,
        search
      }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    placeholderData: (previousData) => previousData
  });

const fetchSecretApprovalRequestDetails = async ({
  id
}: Omit<TGetSecretApprovalRequestDetails, "decryptKey">) => {
  const { data } = await apiRequest.get<{ approval: TSecretApprovalRequest }>(
    `/api/v1/secret-approval-requests/${id}`
  );

  return data.approval;
};

export const useGetSecretApprovalRequestDetails = ({
  id,
  options = {}
}: TGetSecretApprovalRequestDetails & {
  options?: Omit<
    UseQueryOptions<
      TSecretApprovalRequest,
      unknown,
      TSecretApprovalRequest,
      ReturnType<typeof secretApprovalRequestKeys.detail>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.detail({ id }),
    queryFn: () => fetchSecretApprovalRequestDetails({ id }),
    enabled: Boolean(id) && (options?.enabled ?? true)
  });

const fetchSecretApprovalRequestCount = async ({
  workspaceId,
  policyId
}: TGetSecretApprovalRequestCount) => {
  const { data } = await apiRequest.get<{ approvals: TSecretApprovalRequestCount }>(
    "/api/v1/secret-approval-requests/count",
    { params: { workspaceId, policyId } }
  );

  return data.approvals;
};

export const useGetSecretApprovalRequestCount = ({
  workspaceId,
  policyId,
  options = {}
}: TGetSecretApprovalRequestCount & {
  options?: Omit<
    UseQueryOptions<
      TSecretApprovalRequestCount,
      unknown,
      TSecretApprovalRequestCount,
      ReturnType<typeof secretApprovalRequestKeys.count>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.count({ workspaceId, policyId }),
    refetchInterval: 15000,
    queryFn: () => fetchSecretApprovalRequestCount({ workspaceId, policyId }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true)
  });
