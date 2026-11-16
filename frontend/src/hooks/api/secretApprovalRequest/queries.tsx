import { useQueries, useQuery, UseQueryOptions } from "@tanstack/react-query";
import { isAxiosError } from "axios";

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
    projectId,
    environment,
    status,
    committer,
    offset,
    limit,
    search,
    orderBy,
    orderDirection
  }: TGetSecretApprovalRequestList) =>
    [
      {
        projectId,
        environment,
        status,
        committer,
        offset,
        limit,
        search,
        orderBy,
        orderDirection
      },
      "secret-approval-requests"
    ] as const,
  listAllForProject: ({ projectId }: { projectId: string }) =>
    [{ projectId }, "secret-approval-requests"] as const,
  detail: ({ id }: Omit<TGetSecretApprovalRequestDetails, "decryptKey">) =>
    [{ id }, "secret-approval-request-detail"] as const,
  count: ({ projectId, policyId }: TGetSecretApprovalRequestCount) => [
    { projectId },
    "secret-approval-request-count",
    ...(policyId ? [policyId] : [])
  ]
};

export const fetchSecretApprovalRequestList = async ({
  projectId,
  environment,
  committer,
  status = "open",
  limit = 20,
  offset = 0,
  search = "",
  orderBy,
  orderDirection
}: TGetSecretApprovalRequestList) => {
  const { data } = await apiRequest.get<{
    approvals: TSecretApprovalRequest[];
    totalCount: number;
  }>("/api/v1/secret-approval-requests", {
    params: {
      projectId,
      environment,
      committer,
      status,
      limit,
      offset,
      search,
      orderBy,
      orderDirection
    }
  });

  return data;
};

export const useGetSecretApprovalRequests = ({
  projectId,
  environment,
  options = {},
  status,
  limit = 20,
  offset = 0,
  search,
  committer,
  orderBy,
  orderDirection
}: TGetSecretApprovalRequestList & TReactQueryOptions) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.list({
      projectId,
      environment,
      committer,
      status,
      limit,
      search,
      offset,
      orderBy,
      orderDirection
    }),
    queryFn: () =>
      fetchSecretApprovalRequestList({
        projectId,
        environment,
        status,
        committer,
        limit,
        offset,
        search,
        orderBy,
        orderDirection
      }),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    placeholderData: (previousData) => previousData,
    refetchInterval: options?.refetchInterval ?? 30_000
  });

const fetchSecretApprovalRequestDetails = async (
  { id }: Omit<TGetSecretApprovalRequestDetails, "decryptKey">,
  signal?: AbortSignal
) => {
  const { data } = await apiRequest.get<{ approval: TSecretApprovalRequest }>(
    `/api/v1/secret-approval-requests/${id}`,
    { signal }
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

const DETAILS_LIST_CONCURRENCY = 6;
let activeDetailsListFetches = 0;
const queuedDetailsListFetches: (() => void)[] = [];

const detailsFetchCancelledError = () =>
  new DOMException("The change request detail fetch was cancelled", "AbortError");

const fetchSecretApprovalRequestDetailsQueued = async (id: string, signal: AbortSignal) => {
  if (signal.aborted) throw detailsFetchCancelledError();
  if (activeDetailsListFetches < DETAILS_LIST_CONCURRENCY) {
    activeDetailsListFetches += 1;
  } else {
    await new Promise<void>((resolve, reject) => {
      queuedDetailsListFetches.push(resolve);
      signal.addEventListener(
        "abort",
        () => {
          const index = queuedDetailsListFetches.indexOf(resolve);
          if (index === -1) return;
          queuedDetailsListFetches.splice(index, 1);
          reject(detailsFetchCancelledError());
        },
        { once: true }
      );
    });
  }
  try {
    return await fetchSecretApprovalRequestDetails({ id }, signal);
  } finally {
    const next = queuedDetailsListFetches.shift();
    if (next) next();
    else activeDetailsListFetches -= 1;
  }
};

const isRateLimited = (error: unknown) => isAxiosError(error) && error.response?.status === 429;

export const useGetSecretApprovalRequestDetailsList = ({
  ids,
  enabled = true
}: {
  ids: string[];
  enabled?: boolean;
}) =>
  useQueries({
    queries: ids.map((id) => ({
      queryKey: secretApprovalRequestKeys.detail({ id }),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchSecretApprovalRequestDetailsQueued(id, signal),
      enabled,
      retry: (failureCount: number, error: unknown) =>
        failureCount < (isRateLimited(error) ? 3 : 1),
      retryDelay: (failureCount: number, error: unknown) => {
        const retryAfter = Number(
          isAxiosError(error) ? error.response?.headers["retry-after"] : undefined
        );
        if (isRateLimited(error))
          return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000;
        return Math.min(1000 * 2 ** failureCount, 30_000);
      }
    }))
  });

const fetchSecretApprovalRequestCount = async ({
  projectId,
  policyId
}: TGetSecretApprovalRequestCount) => {
  const { data } = await apiRequest.get<{ approvals: TSecretApprovalRequestCount }>(
    "/api/v1/secret-approval-requests/count",
    { params: { projectId, policyId } }
  );

  return data.approvals;
};

export const useGetSecretApprovalRequestCount = ({
  projectId,
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
    queryKey: secretApprovalRequestKeys.count({ projectId, policyId }),
    queryFn: () => fetchSecretApprovalRequestCount({ projectId, policyId }),
    ...options,
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? 30_000
  });
