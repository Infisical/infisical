import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { AgentVaultMemberType } from "./enums";
import {
  TAgentVaultAccessBundleDetails,
  TAgentVaultAccessBundleListItem,
  TAgentVaultActivityConfigResponse,
  TAgentVaultActivityPage,
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
    [...agentVaultKeys.sessions(orgId), sessionId, "activity", range ?? {}] as const
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
      const { data } = await apiRequest.get<{
        sessions: TAgentVaultSession[];
        totalCount: number;
      }>("/api/v1/agent-vault/sessions", { params });
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
 * Cursor pagination, newest first.
 *
 * Polling continues however many pages the viewer has scrolled through. An interval refetch on an
 * infinite query re-runs every page it holds, so the cost grows with each page opened; pages are small
 * enough, and the poll slow enough, that this is cheaper than a Live badge that quietly goes dark once
 * someone scrolls.
 */
export const useGetAgentVaultSessionActivity = (
  sessionId: string | undefined,
  {
    enabled = true,
    isActive = false,
    from,
    to
  }: { enabled?: boolean; isActive?: boolean; from?: Date; to?: Date } = {}
) => {
  const { currentOrg } = useOrganization();

  // Serialised into the key, so narrowing the window starts a fresh page one rather than appending
  // to the pages fetched for the previous one.
  const range = { from: from?.toISOString(), to: to?.toISOString() };

  return useInfiniteQuery({
    queryKey: agentVaultKeys.sessionActivity(currentOrg.id, sessionId ?? "", range),
    enabled: enabled && Boolean(sessionId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data } = await apiRequest.get<TAgentVaultActivityPage>(
        `/api/v1/agent-vault/sessions/${sessionId}/activity`,
        {
          params: {
            limit: ACTIVITY_PAGE_RECORDS,
            ...(pageParam ? { before: pageParam } : {}),
            ...(range.from ? { from: range.from } : {}),
            ...(range.to ? { to: range.to } : {})
          }
        }
      );
      return data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // Narrowing the time range changes the key, and without this the query drops to `pending` with
    // no data. The tab's loading branch then unmounts the whole filter row, so the date picker loses
    // the range it is displaying and remounts on its own default.
    placeholderData: (prev) => prev,
    // 15s, not PAM's 5s. PAM tails a live terminal, where something new lands between any two ticks.
    // Here the proxy buffers for about a minute before it ships, so a chunk arrives every minute or
    // two and a faster poll mostly re-fetches a response the browser already holds — at the cost of
    // an index read, a key unwrap and a presigned URL per chunk, for every page the viewer has open.
    refetchInterval: isActive ? 15_000 : false,
    staleTime: 0
  });
};
