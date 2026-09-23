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
/**
 * Records per page, not chunks. A chunk holds 1 to 1000 depending on how busy the agent was, so
 * asking for chunks makes the page size, and the browser's load, depend on the agent's pace.
 */
const ACTIVITY_PAGE_RECORDS = 200;

/**
 * Records per read of what arrived. Larger than a page, so a tab back from the background catches up in a
 * read or two rather than one small read per poll.
 */
const ACTIVITY_LIVE_RECORDS = 1000;

/** Reads one poll may chain while a backlog drains. Whatever is left waits for the next poll. */
const ACTIVITY_LIVE_MAX_READS = 10;

/**
 * 15s, not PAM's 5s. PAM tails a live terminal, where something new lands between any two ticks. Here the
 * proxy buffers for about a minute before it ships, so a chunk arrives every minute or two and a faster
 * poll mostly asks for nothing.
 */
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

/**
 * One session by id, so a link to a timeline opens whatever page, scope or filter the viewer is on.
 *
 * Only runs when the session is not already in the loaded list. The endpoint answers the same 404 for
 * a session that does not exist and one the viewer may not see, so there is nothing to tell apart here.
 */
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
    // Matches the list query beside it. Status is derived from the clock, so a sheet left open on an
    // active session has to notice it expiring: without this the header keeps saying Active and the
    // activity tab keeps claiming Live, on a session that stopped working.
    refetchInterval: 30_000,
    retry: false
  });
};

/**
 * A session's activity, in two queries: older pages, loaded once each as the viewer scrolls, and a poll for
 * what arrives while the sheet is open. Each fetch decrypts its own chunks, so loading, cancelling and
 * retrying are React Query's state rather than something the sheet tracks alongside it.
 *
 * The poll is its own query on purpose. Polling the pages re-fetched every page held, so the cost grew
 * with each page opened, and every new chunk shifted each page boundary down, dropping rows off the
 * bottom. Writing arrivals into the pages' cache instead races "load more", which saves the pages it
 * started from over anything written in the meantime.
 */
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

  // Serialised into the key, so narrowing the window starts a fresh page one rather than appending
  // to the pages fetched for the previous one.
  const range = { from: from?.toISOString(), to: to?.toISOString() };
  const url = `/api/v1/agent-vault/sessions/${sessionId}/activity`;

  // Swapped during render, so neither query below fetches a new session into the old one's cache. Shared
  // by both, so a chunk the poll opened is not downloaded again when a page lists it.
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
    // Narrowing the time range changes the key, and without this the query drops to `pending` with
    // no data. The tab's loading branch then unmounts the whole filter row, so the date picker loses
    // the range it is displaying and remounts on its own default. Only within one session: another
    // session's rows shown under this one's header would be wrong in a way no loading state covers.
    placeholderData: (prev, prevQuery) =>
      sessionId && prevQuery?.queryKey.includes(sessionId) ? prev : undefined,
    staleTime: 0,
    // Pages carry decrypted plaintext, so they go the moment nothing shows them rather than after
    // the default five minutes.
    gcTime: 0
  });

  // Picks up where the first page's read left off. Never from a placeholder, which belongs to the
  // previous range.
  const receivedFrom = history.isPlaceholderData
    ? undefined
    : history.data?.pages[0]?.nextReceivedAfter;
  const liveKey = agentVaultKeys.sessionActivityLive(currentOrg.id, sessionId ?? "", range);

  const live = useQuery({
    queryKey: liveKey,
    enabled: enabled && isLive && Boolean(sessionId) && Boolean(receivedFrom),
    // Accumulates: each poll folds what arrived into everything the earlier polls returned.
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

  // Kept after the poll stops, so a session that expires with the sheet open does not lose the rows that
  // arrived while it was watched.
  return { history, arrived: live.data };
};
