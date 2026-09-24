import { useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import {
  createActivityChunkCache,
  decryptActivityPage,
  mergeActivityPages,
  TAgentVaultActivityChunkCache
} from "./activityDecrypt";
import { AgentVaultMemberType } from "./enums";
import {
  TAgentVaultAccessBundleDetails,
  TAgentVaultAccessBundleListItem,
  TAgentVaultActivityConfigResponse,
  TAgentVaultActivityPage,
  TAgentVaultDecryptedActivityPage,
  TAgentVaultMember,
  TAgentVaultProductActor,
  TAgentVaultProductMemberOf,
  TAgentVaultProxy,
  TAgentVaultSession,
  TListAgentVaultAccessBundlesDTO,
  TListAgentVaultMembersDTO,
  TListAgentVaultProxiesDTO,
  TListAgentVaultSessionsDTO
} from "./types";

export const fetchAgentVaultProjectId = async () => {
  const { data } = await apiRequest.get<{ projectId: string }>("/api/v1/agent-vault/project");
  return data.projectId;
};

// Every key carries the org, because Agent Vault is org-scoped through the JWT rather than through a
// path parameter: without it a switch to another org would serve the previous org's data from cache.
const ACTIVITY_PAGE_RECORDS = 200;

const ACTIVITY_LIVE_RECORDS = 1000;

const ACTIVITY_LIVE_MAX_READS = 10;

const ACTIVITY_LIVE_POLL_MS = 15_000;

export const agentVaultKeys = {
  all: (orgId: string) => ["agent-vault", orgId] as const,
  accessBundles: (orgId: string) => [...agentVaultKeys.all(orgId), "access-bundles"] as const,
  accessBundle: (orgId: string, accessBundleId: string) =>
    [...agentVaultKeys.accessBundles(orgId), accessBundleId] as const,
  // sessions() is the invalidation prefix; folding the parameters in would put an `undefined` in it,
  // which prefix-matches nothing.
  sessions: (orgId: string) => [...agentVaultKeys.all(orgId), "sessions"] as const,
  session: (orgId: string, sessionId: string) =>
    [...agentVaultKeys.sessions(orgId), "detail", sessionId] as const,
  sessionList: (orgId: string, params?: TListAgentVaultSessionsDTO) =>
    [...agentVaultKeys.sessions(orgId), params] as const,
  accessBundleList: (orgId: string, params?: TListAgentVaultAccessBundlesDTO) =>
    [...agentVaultKeys.accessBundles(orgId), "list", params] as const,
  proxies: (orgId: string) => [...agentVaultKeys.all(orgId), "proxies"] as const,
  proxyList: (orgId: string, params?: TListAgentVaultProxiesDTO) =>
    [...agentVaultKeys.proxies(orgId), params] as const,
  accessBundleMembers: (orgId: string, accessBundleId: string) =>
    [...agentVaultKeys.accessBundle(orgId, accessBundleId), "members"] as const,
  accessBundleMemberList: (
    orgId: string,
    accessBundleId: string,
    params?: Omit<TListAgentVaultMembersDTO, "actorType">
  ) => [...agentVaultKeys.accessBundleMembers(orgId, accessBundleId), params] as const,
  members: (orgId: string) => [...agentVaultKeys.all(orgId), "members"] as const,
  memberList: (orgId: string, params?: TListAgentVaultMembersDTO) =>
    [...agentVaultKeys.members(orgId), params] as const,
  // Nested under members() so adding a member invalidates the candidate list too.
  availableMembers: (orgId: string) => [...agentVaultKeys.members(orgId), "available"] as const,
  availableMemberList: (orgId: string, params?: TListAgentVaultMembersDTO) =>
    [...agentVaultKeys.availableMembers(orgId), params] as const,
  activityConfig: (orgId: string) => [...agentVaultKeys.all(orgId), "activity-config"] as const,
  sessionActivity: (orgId: string, sessionId: string, range?: { from?: string; to?: string }) =>
    [...agentVaultKeys.sessions(orgId), sessionId, "activity", range ?? {}] as const,
  sessionActivityLive: (orgId: string, sessionId: string, range?: { from?: string; to?: string }) =>
    [...agentVaultKeys.sessions(orgId), sessionId, "activity-live", range ?? {}] as const
};

export const useListAgentVaultMembers = <T extends AgentVaultMemberType = AgentVaultMemberType>(
  params: TListAgentVaultMembersDTO & { actorType?: T } = {},
  enabled = true
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.memberList(currentOrg.id, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        members: TAgentVaultProductMemberOf<T>[];
        totalCount: number;
      }>("/api/v1/agent-vault/members", { params });
      return data;
    },
    enabled,
    placeholderData: (prev) => prev
  });
};

// One page is enough for a picker: past it the admin searches. The default lives here so both add
// dialogs page the same way.
const AVAILABLE_MEMBER_LIMIT = 50;

export const useListAvailableAgentVaultMembers = <
  T extends AgentVaultMemberType = AgentVaultMemberType
>(
  { limit = AVAILABLE_MEMBER_LIMIT, ...rest }: TListAgentVaultMembersDTO & { actorType?: T } = {},
  enabled = true
) => {
  const { currentOrg } = useOrganization();
  const params = { ...rest, limit };

  return useQuery({
    queryKey: agentVaultKeys.availableMemberList(currentOrg.id, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        actors: Extract<TAgentVaultProductActor, { type: T }>[];
        totalCount: number;
      }>("/api/v1/agent-vault/members/available", { params });
      return data;
    },
    enabled,
    placeholderData: (prev) => prev
  });
};

export const useListAgentVaultAccessBundleMembers = (
  accessBundleId: string,
  params: Omit<TListAgentVaultMembersDTO, "actorType"> = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundleMemberList(currentOrg.id, accessBundleId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ members: TAgentVaultMember[]; totalCount: number }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`,
        { params }
      );
      return data;
    },
    enabled: Boolean(accessBundleId),
    placeholderData: (prev) => prev
  });
};

export const useListAgentVaultAccessBundles = (params: TListAgentVaultAccessBundlesDTO = {}) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundleList(currentOrg.id, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        accessBundles: TAgentVaultAccessBundleListItem[];
        totalCount: number;
      }>("/api/v1/agent-vault/access-bundles", { params });
      return data;
    },
    placeholderData: (prev) => prev
  });
};

export const useGetAgentVaultAccessBundle = (accessBundleId: string) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accessBundle: TAgentVaultAccessBundleDetails }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`
      );
      return data.accessBundle;
    },
    enabled: Boolean(accessBundleId)
  });
};

export const useListAgentVaultSessions = (params?: TListAgentVaultSessionsDTO) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.sessionList(currentOrg.id, params),
    queryFn: async () => {
      const { statuses, ...rest } = params ?? {};
      const { data } = await apiRequest.get<{
        sessions: TAgentVaultSession[];
        totalCount: number;
      }>("/api/v1/agent-vault/sessions", {
        params: { ...rest, status: statuses?.length ? statuses.join(",") : undefined }
      });
      return data;
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev
  });
};

export const useListAgentVaultProxies = (params: TListAgentVaultProxiesDTO = {}) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.proxyList(currentOrg.id, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ proxies: TAgentVaultProxy[]; totalCount: number }>(
        "/api/v1/agent-vault/proxies",
        { params }
      );
      return data;
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev
  });
};

export const useGetAgentVaultActivityConfig = (enabled = true) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.activityConfig(currentOrg.id),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultActivityConfigResponse>(
        "/api/v1/agent-vault/activity/config"
      );
      return data;
    },
    enabled
  });
};

export const useGetAgentVaultSession = (sessionId: string | undefined, enabled = true) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.session(currentOrg.id, sessionId ?? ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ session: TAgentVaultSession }>(
        `/api/v1/agent-vault/sessions/${sessionId}`
      );
      return data.session;
    },
    enabled: enabled && Boolean(sessionId),
    refetchInterval: 30_000,
    retry: false
  });
};

export const useGetAgentVaultSessionActivity = (
  sessionId: string | undefined,
  {
    enabled = true,
    isLive = false,
    from,
    to
  }: { enabled?: boolean; isLive?: boolean; from?: Date; to?: Date } = {}
) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();

  const range = { from: from?.toISOString(), to: to?.toISOString() };
  const url = `/api/v1/agent-vault/sessions/${sessionId}/activity`;

  // Reset during render so neither query fetches a new session into the old one's cache.
  const chunkCache = useRef<TAgentVaultActivityChunkCache | null>(null);
  if (!chunkCache.current || chunkCache.current.sessionId !== sessionId) {
    chunkCache.current = createActivityChunkCache(sessionId ?? "");
  }

  const history = useInfiniteQuery({
    queryKey: agentVaultKeys.sessionActivity(currentOrg.id, sessionId ?? "", range),
    enabled: enabled && Boolean(sessionId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const cache = chunkCache.current as TAgentVaultActivityChunkCache;
      const { data } = await apiRequest.get<TAgentVaultActivityPage>(url, {
        params: {
          limit: ACTIVITY_PAGE_RECORDS,
          ...(pageParam ? { before: pageParam } : {}),
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {})
        },
        signal
      });
      return decryptActivityPage(data, cache, signal);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (prev, prevQuery) =>
      sessionId && prevQuery?.queryKey.includes(sessionId) ? prev : undefined,
    staleTime: 0,
    // Pages hold decrypted plaintext, so drop them as soon as nothing observes them.
    gcTime: 0
  });

  const receivedFrom = history.isPlaceholderData
    ? undefined
    : history.data?.pages[0]?.nextReceivedAfter;
  const liveKey = agentVaultKeys.sessionActivityLive(currentOrg.id, sessionId ?? "", range);

  const live = useQuery({
    queryKey: liveKey,
    enabled: enabled && isLive && Boolean(sessionId) && Boolean(receivedFrom),
    queryFn: async ({ signal }) => {
      const cache = chunkCache.current as TAgentVaultActivityChunkCache;
      let arrived = queryClient.getQueryData<TAgentVaultDecryptedActivityPage>(liveKey);
      let receivedAfter = arrived?.nextReceivedAfter ?? receivedFrom;
      let hasMore = true;
      for (let read = 0; hasMore && read < ACTIVITY_LIVE_MAX_READS; read += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await apiRequest.get<TAgentVaultActivityPage>(url, {
          params: { limit: ACTIVITY_LIVE_RECORDS, receivedAfter },
          signal
        });
        // eslint-disable-next-line no-await-in-loop
        arrived = mergeActivityPages(arrived, await decryptActivityPage(data, cache, signal));
        receivedAfter = data.nextReceivedAfter;
        ({ hasMore } = data);
      }
      return arrived as TAgentVaultDecryptedActivityPage;
    },
    refetchInterval: ACTIVITY_LIVE_POLL_MS,
    staleTime: 0,
    gcTime: 0
  });

  return { history, arrived: live.data };
};
