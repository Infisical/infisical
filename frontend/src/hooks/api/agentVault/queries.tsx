import { useMemo, useRef, useState } from "react";
import {
  InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  UseQueryOptions
} from "@tanstack/react-query";
import axios from "axios";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";
import { VARIABLE_KEY_MAX_LENGTH, VARIABLE_KEY_RE } from "@app/helpers/agentVaultVariables";

import {
  AgentVaultMemberType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultVariableScope
} from "./enums";
import {
  createSessionLogChunkCache,
  decryptSessionLogPage,
  doesGapFillLeaveAHole,
  isLiveGapPossible,
  isRetryableResult,
  mergeSessionLogPages,
  SESSION_LOG_UPLOAD_GRACE_MS,
  sessionLogChunkKey,
  TAgentVaultSessionLogChunkCache
} from "./sessionLogDecrypt";
import {
  TAgentVaultAccessBundleDetails,
  TAgentVaultAccessBundleListItem,
  TAgentVaultBundleSkill,
  TAgentVaultDecryptedSessionLogPage,
  TAgentVaultDelegationDetail,
  TAgentVaultMember,
  TAgentVaultOauthAuthorization,
  TAgentVaultProductActor,
  TAgentVaultProductMember,
  TAgentVaultProductMemberOf,
  TAgentVaultProxy,
  TAgentVaultProxyCa,
  TAgentVaultSession,
  TAgentVaultSessionLogCorsProbe,
  TAgentVaultSessionLogHealth,
  TAgentVaultSessionLogHistoryPage,
  TAgentVaultSessionLogReadCheck,
  TAgentVaultSessionLogSettingsState,
  TAgentVaultSessionLogTailPage,
  TAgentVaultSkillDetail,
  TAgentVaultSkillPage,
  TAgentVaultSkillVersion,
  TAgentVaultSkillVersionWithFiles,
  TAgentVaultVariable,
  TListAgentVaultAccessBundlesDTO,
  TListAgentVaultMembersDTO,
  TListAgentVaultProxiesDTO,
  TListAgentVaultSessionsDTO,
  TListAgentVaultSkillsDTO,
  TListAgentVaultVariablesDTO
} from "./types";

export const fetchAgentVaultOauthAuthorization = async (
  authorizationId: string,
  signal?: AbortSignal
) => {
  const { data } = await apiRequest.get<{ authorization: TAgentVaultOauthAuthorization }>(
    `/api/v1/agent-vault/oauth/authorizations/${encodeURIComponent(authorizationId)}`,
    { signal }
  );
  return data.authorization;
};

export const AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS = 15_000;

const SESSION_LOG_GAP_FILL_INTERVAL_MS = 60_000;

// The server's message when it can't read the bucket: the cause for an admin, a plain one for everyone else.
export const getSessionLogStorageError = (error: unknown) =>
  axios.isAxiosError<{ error?: string; message?: string }>(error) &&
  error.response?.data?.error === "AgentVaultSessionLogStorageUnavailable"
    ? (error.response.data.message ?? null)
    : null;

// Every key carries the org and the project. By-id routes take the project from the row, so without the project in
// the key a switch to another project would serve the previous one's data from cache.
export const agentVaultKeys = {
  oauthAuthorization: (orgId: string, authorizationId: string) =>
    ["agent-vault", orgId, "oauth-authorizations", authorizationId] as const,
  all: (orgId: string, projectId: string) => ["agent-vault", orgId, projectId] as const,
  accessBundles: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "access-bundles"] as const,
  accessBundle: (orgId: string, projectId: string, accessBundleId: string) =>
    [...agentVaultKeys.accessBundles(orgId, projectId), accessBundleId] as const,
  // sessions() is the invalidation prefix; folding the parameters in would put an `undefined` in it,
  // which prefix-matches nothing.
  sessions: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "sessions"] as const,
  session: (orgId: string, projectId: string, sessionId: string) =>
    [...agentVaultKeys.sessions(orgId, projectId), "detail", sessionId] as const,
  sessionList: (orgId: string, projectId: string, params?: TListAgentVaultSessionsDTO) =>
    [...agentVaultKeys.sessions(orgId, projectId), params] as const,
  accessBundleList: (orgId: string, projectId: string, params?: TListAgentVaultAccessBundlesDTO) =>
    [...agentVaultKeys.accessBundles(orgId, projectId), "list", params] as const,
  proxies: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "proxies"] as const,
  proxyList: (orgId: string, projectId: string, params?: TListAgentVaultProxiesDTO) =>
    [...agentVaultKeys.proxies(orgId, projectId), params] as const,
  accessBundleMembers: (orgId: string, projectId: string, accessBundleId: string) =>
    [...agentVaultKeys.accessBundle(orgId, projectId, accessBundleId), "members"] as const,
  accessBundleMemberList: (
    orgId: string,
    projectId: string,
    accessBundleId: string,
    params?: TListAgentVaultMembersDTO
  ) => [...agentVaultKeys.accessBundleMembers(orgId, projectId, accessBundleId), params] as const,
  // Nested under accessBundleMembers() so a grant invalidates the candidate list too.
  availableAccessBundleMemberList: (
    orgId: string,
    projectId: string,
    accessBundleId: string,
    params?: TListAgentVaultMembersDTO
  ) =>
    [
      ...agentVaultKeys.accessBundleMembers(orgId, projectId, accessBundleId),
      "available",
      params
    ] as const,
  variables: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "variables"] as const,
  variableList: (orgId: string, projectId: string, params: TListAgentVaultVariablesDTO) =>
    [...agentVaultKeys.variables(orgId, projectId), "list", params] as const,
  variableKeyStatus: (
    orgId: string,
    projectId: string,
    scope: AgentVaultVariableScope,
    keys: string[]
  ) => [...agentVaultKeys.variables(orgId, projectId), "key-status", scope, keys] as const,
  skills: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "skills"] as const,
  skillLists: (orgId: string, projectId: string) =>
    [...agentVaultKeys.skills(orgId, projectId), "list"] as const,
  skillList: (orgId: string, projectId: string, params: TListAgentVaultSkillsDTO) =>
    [...agentVaultKeys.skillLists(orgId, projectId), params] as const,
  skill: (orgId: string, projectId: string, skillId: string) =>
    [...agentVaultKeys.skills(orgId, projectId), "detail", skillId] as const,
  skillVersions: (orgId: string, projectId: string, skillId: string) =>
    [...agentVaultKeys.skill(orgId, projectId, skillId), "versions"] as const,
  skillVersion: (orgId: string, projectId: string, skillId: string, version: number) =>
    [...agentVaultKeys.skillVersions(orgId, projectId, skillId), version] as const,
  // Nested under accessBundle() so changes to the bundle refresh its skills too.
  accessBundleSkills: (orgId: string, projectId: string, accessBundleId: string) =>
    [...agentVaultKeys.accessBundle(orgId, projectId, accessBundleId), "skills"] as const,
  members: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "members"] as const,
  memberList: (orgId: string, projectId: string, params?: TListAgentVaultMembersDTO) =>
    [...agentVaultKeys.members(orgId, projectId), params] as const,
  // Nested under members() so adding a member invalidates the candidate list too.
  availableMembers: (orgId: string, projectId: string) =>
    [...agentVaultKeys.members(orgId, projectId), "available"] as const,
  availableMemberList: (orgId: string, projectId: string, params?: TListAgentVaultMembersDTO) =>
    [...agentVaultKeys.availableMembers(orgId, projectId), params] as const,
  delegations: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "delegations"] as const,
  delegation: (orgId: string, projectId: string, machineIdentityId: string) =>
    [...agentVaultKeys.delegations(orgId, projectId), machineIdentityId] as const,
  // Nested under delegation() so changing the delegation can invalidate the candidates alone: the
  // delegation itself is written from each change's result.
  availableDelegationSubjects: (orgId: string, projectId: string, machineIdentityId: string) =>
    [...agentVaultKeys.delegation(orgId, projectId, machineIdentityId), "available"] as const,
  availableDelegationSubjectList: (
    orgId: string,
    projectId: string,
    machineIdentityId: string,
    params?: TListAgentVaultMembersDTO
  ) =>
    [
      ...agentVaultKeys.availableDelegationSubjects(orgId, projectId, machineIdentityId),
      params
    ] as const,
  sessionLogSettings: (orgId: string, projectId: string) =>
    [...agentVaultKeys.all(orgId, projectId), "settings", "session-logs"] as const,
  sessionLogHealth: (orgId: string, projectId: string) =>
    [...agentVaultKeys.sessionLogSettings(orgId, projectId), "health"] as const,
  sessionLogCorsProbe: (orgId: string, projectId: string) =>
    [...agentVaultKeys.sessionLogSettings(orgId, projectId), "cors-probe"] as const,
  sessionLogs: (
    orgId: string,
    projectId: string,
    sessionId: string,
    range?: { from?: string; to?: string }
  ) => [...agentVaultKeys.sessions(orgId, projectId), sessionId, "logs", range ?? {}] as const,
  sessionLogsLive: (
    orgId: string,
    projectId: string,
    sessionId: string,
    range?: { from?: string; to?: string }
  ) => [...agentVaultKeys.sessions(orgId, projectId), sessionId, "logs-live", range ?? {}] as const
};

// Keeps the previous page up while new parameters load, but never across projects.
const keepPreviousInProject =
  (projectId: string) =>
  <T,>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }) =>
    prevQuery?.queryKey[2] === projectId ? prev : undefined;

// A dropped connection, a deploy, a 5xx or a rate limit can clear on the next poll; any other client error,
// such as the 404 of an expired authorization, never will.
export const isTerminalOauthAuthorizationError = (error: unknown) => {
  if (!axios.isAxiosError(error)) return true;
  const status = error.response?.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

export const useGetAgentVaultOauthAuthorization = (authorizationId: string) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.oauthAuthorization(currentOrg.id, authorizationId),
    queryFn: ({ signal }) => fetchAgentVaultOauthAuthorization(authorizationId, signal),
    enabled: Boolean(authorizationId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: (query) => {
      const { data, error } = query.state;
      if (error && isTerminalOauthAuthorizationError(error)) return false;
      if (data && data.status !== AgentVaultOauthAuthorizationStatus.Pending) return false;
      return error ? 5000 : 2000;
    },
    // The provider popup can leave the Infisical tab in the background until authorization finishes.
    refetchIntervalInBackground: true
  });
};

export const useListAgentVaultMembers = <T extends AgentVaultMemberType = AgentVaultMemberType>(
  projectId: string,
  params: TListAgentVaultMembersDTO & { actorType?: T } = {},
  enabled = true
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.memberList(currentOrg.id, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        members: TAgentVaultProductMemberOf<T>[];
        totalCount: number;
      }>("/api/v1/agent-vault/members", { params: { ...params, projectId } });
      return data;
    },
    enabled,
    placeholderData: keepPreviousInProject(projectId)
  });
};

// An identity with no delegation reads as null rather than an error. Admins only. Refetched on every visit, because the
// bundles the identity can't act on change with grants and roles anywhere in Agent Vault.
export const useGetAgentVaultDelegation = (
  projectId: string,
  machineIdentityId: string,
  enabled = true
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.delegation(currentOrg.id, projectId, machineIdentityId),
    queryFn: async () => {
      try {
        const { data } = await apiRequest.get<{ delegation: TAgentVaultDelegationDetail }>(
          `/api/v1/agent-vault/delegations/${machineIdentityId}`,
          { params: { projectId } }
        );
        return data.delegation;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
    enabled,
    staleTime: 0
  });
};

// One page is enough for a picker: past it the admin searches. The default lives here so both add
// dialogs page the same way.
const AVAILABLE_MEMBER_LIMIT = 50;

export const useListAvailableAgentVaultAccessBundleMembers = (
  projectId: string,
  accessBundleId: string,
  { limit = AVAILABLE_MEMBER_LIMIT, ...rest }: TListAgentVaultMembersDTO = {},
  enabled = true
) => {
  const { currentOrg } = useOrganization();
  const params = { ...rest, limit };

  return useQuery({
    queryKey: agentVaultKeys.availableAccessBundleMemberList(
      currentOrg.id,
      projectId,
      accessBundleId,
      params
    ),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        members: TAgentVaultProductMember[];
        totalCount: number;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/members/available`, { params });
      return data;
    },
    enabled: enabled && Boolean(accessBundleId),
    placeholderData: keepPreviousInProject(projectId)
  });
};

// The Agent Vault users and groups not yet in the machine identity's delegation. Admins only.
export const useListAvailableAgentVaultDelegationSubjects = (
  projectId: string,
  machineIdentityId: string,
  { limit = AVAILABLE_MEMBER_LIMIT, ...rest }: TListAgentVaultMembersDTO = {},
  enabled = true
) => {
  const { currentOrg } = useOrganization();
  const params = { ...rest, limit };

  return useQuery({
    queryKey: agentVaultKeys.availableDelegationSubjectList(
      currentOrg.id,
      projectId,
      machineIdentityId,
      params
    ),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        members: TAgentVaultProductMember[];
        totalCount: number;
      }>(`/api/v1/agent-vault/delegations/${machineIdentityId}/subjects/available`, {
        params: { ...params, projectId }
      });
      return data;
    },
    enabled: enabled && Boolean(machineIdentityId),
    placeholderData: keepPreviousInProject(projectId)
  });
};

export const useListAvailableAgentVaultMembers = <
  T extends AgentVaultMemberType = AgentVaultMemberType
>(
  projectId: string,
  { limit = AVAILABLE_MEMBER_LIMIT, ...rest }: TListAgentVaultMembersDTO & { actorType?: T } = {},
  enabled = true
) => {
  const { currentOrg } = useOrganization();
  const params = { ...rest, limit };

  return useQuery({
    queryKey: agentVaultKeys.availableMemberList(currentOrg.id, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        actors: Extract<TAgentVaultProductActor, { type: T }>[];
        totalCount: number;
      }>("/api/v1/agent-vault/members/available", { params: { ...params, projectId } });
      return data;
    },
    enabled,
    placeholderData: keepPreviousInProject(projectId)
  });
};

export const useListAgentVaultAccessBundleMembers = (
  projectId: string,
  accessBundleId: string,
  params: TListAgentVaultMembersDTO = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundleMemberList(
      currentOrg.id,
      projectId,
      accessBundleId,
      params
    ),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ members: TAgentVaultMember[]; totalCount: number }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`,
        { params }
      );
      return data;
    },
    enabled: Boolean(accessBundleId),
    placeholderData: keepPreviousInProject(projectId)
  });
};

type TAgentVaultAccessBundleList = {
  accessBundles: TAgentVaultAccessBundleListItem[];
  totalCount: number;
};

export const useListAgentVaultAccessBundles = (
  projectId: string,
  params: TListAgentVaultAccessBundlesDTO = {},
  options?: Omit<UseQueryOptions<TAgentVaultAccessBundleList>, "queryKey" | "queryFn">
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    placeholderData: keepPreviousInProject(projectId),
    ...options,
    queryKey: agentVaultKeys.accessBundleList(currentOrg.id, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultAccessBundleList>(
        "/api/v1/agent-vault/access-bundles",
        { params: { ...params, projectId } }
      );
      return data;
    }
  });
};

// One page holds them all in practice: it is only the bundles the caller reaches that still require their values.
export const useListAgentVaultAccessBundlesRequiringSetup = (projectId: string) =>
  useListAgentVaultAccessBundles(projectId, { requiresSetup: true, limit: 100 });

// Only the count is read, so one row is enough.
export const useListGrantedAgentVaultAccessBundlesRequiringSetup = (projectId: string) =>
  useListAgentVaultAccessBundles(projectId, { requiresSetup: true, granted: true, limit: 1 });

export const useGetAgentVaultAccessBundle = (projectId: string, accessBundleId: string) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundle(currentOrg.id, projectId, accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accessBundle: TAgentVaultAccessBundleDetails }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`
      );
      return data.accessBundle;
    },
    enabled: Boolean(accessBundleId)
  });
};

export type TAgentVaultSessionList = { sessions: TAgentVaultSession[]; totalCount: number };

export const useListAgentVaultSessions = (
  projectId: string,
  params?: TListAgentVaultSessionsDTO,
  options?: Omit<UseQueryOptions<TAgentVaultSessionList>, "queryKey" | "queryFn">
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    refetchInterval: 30_000,
    placeholderData: keepPreviousInProject(projectId),
    ...options,
    queryKey: agentVaultKeys.sessionList(currentOrg.id, projectId, params),
    queryFn: async () => {
      const { statuses, ...rest } = params ?? {};
      const { data } = await apiRequest.get<TAgentVaultSessionList>(
        "/api/v1/agent-vault/sessions",
        {
          params: {
            ...rest,
            projectId,
            status: statuses?.length ? statuses.join(",") : undefined
          }
        }
      );
      return data;
    }
  });
};

export type TAgentVaultProxyList = { proxies: TAgentVaultProxy[]; totalCount: number };

export const useListAgentVaultProxies = (
  projectId: string,
  params: TListAgentVaultProxiesDTO = {},
  options?: Omit<UseQueryOptions<TAgentVaultProxyList>, "queryKey" | "queryFn">
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    refetchInterval: 30_000,
    placeholderData: keepPreviousInProject(projectId),
    ...options,
    queryKey: agentVaultKeys.proxyList(currentOrg.id, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultProxyList>("/api/v1/agent-vault/proxies", {
        params: { ...params, projectId }
      });
      return data;
    }
  });
};

export const fetchAgentVaultProxyCa = async (proxyId: string) => {
  const { data } = await apiRequest.get<{ ca: TAgentVaultProxyCa }>(
    `/api/v1/agent-vault/proxies/${proxyId}/ca`
  );
  return data.ca;
};

export const useGetAgentVaultSessionLogSettings = (projectId: string, enabled = true) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.sessionLogSettings(currentOrg.id, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultSessionLogSettingsState>(
        "/api/v1/agent-vault/settings/session-logs",
        { params: { projectId } }
      );
      return data;
    },
    enabled
  });
};

export const useGetAgentVaultSessionLogHealth = (projectId: string, enabled = true) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.sessionLogHealth(currentOrg.id, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ health: TAgentVaultSessionLogHealth }>(
        "/api/v1/agent-vault/settings/session-logs/health",
        { params: { projectId } }
      );
      return data.health;
    },
    enabled
  });
};

export const fetchAgentVaultSessionLogReadAccess = async (
  projectId: string
): Promise<TAgentVaultSessionLogReadCheck | null> => {
  const { data } = await apiRequest.get<{ probe: TAgentVaultSessionLogCorsProbe }>(
    "/api/v1/agent-vault/settings/session-logs/cors-probe",
    { params: { projectId } }
  );
  if (!data.probe) return null;
  const { host, origin } = new URL(data.probe.url);
  let isHostBlocked = false;
  const onViolation = (event: SecurityPolicyViolationEvent) => {
    if (event.effectiveDirective === "connect-src" && event.blockedURI.startsWith(origin)) {
      isHostBlocked = true;
    }
  };
  document.addEventListener("securitypolicyviolation", onViolation);
  // The probed object never exists. S3 adds CORS headers to its 404 and to a 403 alike, so fetch
  // rejects only when the rule is missing or this page's CSP blocks the host, and a 403 means the
  // connection may not read the bucket.
  try {
    const res = await fetch(data.probe.url, { mode: "cors", credentials: "omit" });
    return { status: res.status === 403 ? "access-denied" : "readable", host };
  } catch {
    // The violation event is queued as a task, so it can land after fetch has already rejected.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    return { status: isHostBlocked ? "host-blocked" : "cors-missing", host };
  } finally {
    document.removeEventListener("securitypolicyviolation", onViolation);
  }
};

export const useGetAgentVaultSessionLogCorsProbe = (projectId: string, enabled = true) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.sessionLogCorsProbe(currentOrg.id, projectId),
    queryFn: () => fetchAgentVaultSessionLogReadAccess(projectId),
    enabled,
    retry: false
  });
};

export const useGetAgentVaultSession = (
  projectId: string,
  sessionId: string | undefined,
  enabled = true
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.session(currentOrg.id, projectId, sessionId ?? ""),
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

export const useGetAgentVaultSessionLogs = (
  projectId: string,
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
  const url = `/api/v1/agent-vault/sessions/${sessionId}/logs`;
  const tailUrl = `${url}/tail`;

  // Reset during render so neither query fetches a new session into the old one's cache.
  const chunkCache = useRef<TAgentVaultSessionLogChunkCache | null>(null);
  const lastGapFillAt = useRef(0);
  const isGapPending = useRef(false);
  if (!chunkCache.current || chunkCache.current.sessionId !== sessionId) {
    chunkCache.current = createSessionLogChunkCache(sessionId ?? "");
    lastGapFillAt.current = 0;
    isGapPending.current = false;
  }
  // Set when a gap fill couldn't reach the rows already shown, so some requests may be missing. Only a history load
  // from the top that started after it can bring them back, since older pages lie below them.
  const [unfilledGap, setUnfilledGap] = useState<{ sessionId: string; foundAt: number } | null>(
    null
  );

  const historyKey = agentVaultKeys.sessionLogs(currentOrg.id, projectId, sessionId ?? "", range);
  const history = useInfiniteQuery({
    queryKey: historyKey,
    enabled: enabled && Boolean(sessionId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const cache = chunkCache.current as TAgentVaultSessionLogChunkCache;
      const startedAt = Date.now();
      const { data } = await apiRequest.get<TAgentVaultSessionLogHistoryPage>(url, {
        params: {
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {})
        },
        signal
      });
      if (!pageParam) setUnfilledGap((gap) => (gap && gap.foundAt < startedAt ? null : gap));
      return decryptSessionLogPage(data, cache, signal);
    },
    // Trying again at once won't fix a bucket Infisical can't read; the panel offers Reload instead.
    retry: (failureCount, error) => !getSessionLogStorageError(error) && failureCount < 1,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (prev, prevQuery) =>
      sessionId && prevQuery?.queryKey.includes(sessionId) ? prev : undefined,
    staleTime: 0,
    // Pages hold decrypted plaintext, so drop them as soon as nothing observes them.
    gcTime: 0
  });

  const isHistoryLoaded = Boolean(history.data) && !history.isPlaceholderData;
  // While session logs are off, or for a session that can't be recorded, Infisical refuses every upload.
  const canReceive =
    history.data?.pages[0]?.sessionLogs.enabled !== false &&
    history.data?.pages[0]?.sessionLogs.isRecordable !== false;
  const liveKey = agentVaultKeys.sessionLogsLive(currentOrg.id, projectId, sessionId ?? "", range);

  const live = useQuery({
    queryKey: liveKey,
    enabled: enabled && isLive && canReceive && Boolean(sessionId) && isHistoryLoaded,
    queryFn: async ({ signal }) => {
      const cache = chunkCache.current as TAgentVaultSessionLogChunkCache;
      let arrived =
        queryClient.getQueryData<TAgentVaultDecryptedSessionLogPage<TAgentVaultSessionLogTailPage>>(
          liveKey
        );

      // The feed hands each chunk over once, so a chunk that hadn't landed yet is fetched again here, for as
      // long as it may still be uploading.
      const now = Date.now();
      const uploading = (arrived?.chunks ?? []).filter((chunk) => {
        const result = arrived?.decrypted[sessionLogChunkKey(chunk)];
        const firstSeenAt = result?.gap?.firstSeenAt;
        return (
          result &&
          isRetryableResult(result) &&
          firstSeenAt != null &&
          now < firstSeenAt + SESSION_LOG_UPLOAD_GRACE_MS
        );
      });
      if (arrived && uploading.length) {
        arrived = mergeSessionLogPages(
          arrived,
          await decryptSessionLogPage({ ...arrived, chunks: uploading }, cache, signal, {
            isTail: true
          })
        );
      }

      const lastPolledAt = arrived ? queryClient.getQueryState(liveKey)?.dataUpdatedAt : undefined;
      const { data } = await apiRequest.get<TAgentVaultSessionLogTailPage>(tailUrl, {
        params: arrived ? { cursor: arrived.nextCursor } : {},
        signal
      });

      // The feed may have dropped chunks this tab never saw, so merge in the newest page of history, which lists
      // them from the bucket. At most once a minute; a failed fill stays pending and is tried again on the next poll.
      const polledAt = Date.now();
      if (isLiveGapPossible({ lastPolledAt, now: polledAt, newChunkCount: data.chunks.length })) {
        isGapPending.current = true;
      }
      if (
        isGapPending.current &&
        polledAt - lastGapFillAt.current > SESSION_LOG_GAP_FILL_INTERVAL_MS
      ) {
        try {
          const { data: newest } = await apiRequest.get<TAgentVaultSessionLogHistoryPage>(url, {
            params: {
              ...(range.from ? { from: range.from } : {}),
              ...(range.to ? { to: range.to } : {})
            },
            signal
          });
          const shown = new Set(
            [
              ...(arrived?.chunks ?? []),
              ...(
                queryClient.getQueryData<
                  InfiniteData<TAgentVaultDecryptedSessionLogPage<TAgentVaultSessionLogHistoryPage>>
                >(historyKey)?.pages ?? []
              ).flatMap((page) => page.chunks)
            ].map(sessionLogChunkKey)
          );
          const isGapUnfilled = doesGapFillLeaveAHole(newest, shown);
          arrived = mergeSessionLogPages(
            arrived,
            await decryptSessionLogPage({ ...newest, nextCursor: data.nextCursor }, cache, signal)
          );
          lastGapFillAt.current = polledAt;
          isGapPending.current = false;
          // Only ever set here: rows from an earlier partial fill can make a later page look complete.
          if (isGapUnfilled && sessionId) setUnfilledGap({ sessionId, foundAt: Date.now() });
        } catch (error) {
          if (signal.aborted) throw error;
        }
      }

      // The tail page goes last: the merge keeps its cursor. It can list a chunk more than once, which counts
      // toward a full feed above but is only opened once.
      const tail = {
        ...data,
        chunks: [
          ...new Map(data.chunks.map((chunk) => [sessionLogChunkKey(chunk), chunk])).values()
        ]
      };
      return mergeSessionLogPages(
        arrived,
        await decryptSessionLogPage(tail, cache, signal, { isTail: true })
      );
    },
    refetchInterval: AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS,
    staleTime: 0,
    gcTime: 0
  });

  return {
    history,
    live,
    arrived: live.data,
    isLiveGapUnfilled: Boolean(sessionId) && unfilledGap?.sessionId === sessionId
  };
};

type TAgentVaultVariablePage = { variables: TAgentVaultVariable[]; totalCount: number };

const fetchAgentVaultVariables = async (
  projectId: string,
  { keys, ...params }: TListAgentVaultVariablesDTO
) => {
  const { data } = await apiRequest.get<TAgentVaultVariablePage>("/api/v1/agent-vault/variables", {
    params: { ...params, projectId, keys: keys?.join(",") }
  });
  return data;
};

export const useListAgentVaultVariables = (
  projectId: string,
  params: TListAgentVaultVariablesDTO = {},
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.variableList(currentOrg.id, projectId, params),
    queryFn: () => fetchAgentVaultVariables(projectId, params),
    placeholderData: keepPreviousInProject(projectId),
    enabled
  });
};

const KEY_LOOKUP_BATCH_SIZE = 100;

// The API refuses a whole batch that holds one key it would never accept, so such a key isn't sent. No variable can
// have it, so it counts as missing, as the API says on save.
const isPossibleVariableKey = (key: string) =>
  key.length <= VARIABLE_KEY_MAX_LENGTH && VARIABLE_KEY_RE.test(key);

// Whether each key exists, asked through the keys filter in one request per 100 keys. Asked again on window focus
// and whenever the variables are invalidated, since another admin may create or delete one at any time. A key is in
// neither set until an answer that asked about it arrives; the previous answer stays up meanwhile, so a key it
// already covered doesn't flicker while the next set loads.
export const useAgentVaultVariableKeyStatus = (
  projectId: string,
  keys: readonly string[],
  {
    enabled = true,
    isCached = true,
    scope = AgentVaultVariableScope.Global
  }: { enabled?: boolean; isCached?: boolean; scope?: AgentVaultVariableScope } = {}
) => {
  const { currentOrg } = useOrganization();
  const possibleKeys = [...new Set(keys.filter(isPossibleVariableKey))].sort();

  const { data } = useQuery({
    queryKey: agentVaultKeys.variableKeyStatus(currentOrg.id, projectId, scope, possibleKeys),
    queryFn: async () => {
      const found: string[] = [];
      for (let i = 0; i < possibleKeys.length; i += KEY_LOOKUP_BATCH_SIZE) {
        // eslint-disable-next-line no-await-in-loop
        const page = await fetchAgentVaultVariables(projectId, {
          scope,
          keys: possibleKeys.slice(i, i + KEY_LOOKUP_BATCH_SIZE)
        });
        found.push(...page.variables.map((variable) => variable.key));
      }
      return { asked: possibleKeys, found };
    },
    enabled: enabled && possibleKeys.length > 0,
    placeholderData: keepPreviousInProject(projectId),
    refetchOnWindowFocus: true,
    staleTime: 0,
    ...(isCached ? {} : { gcTime: 0 })
  });

  const keySignature = keys.join(",");
  return useMemo(() => {
    const asked = new Set(data?.asked);
    const found = new Set(data?.found);
    const current = keySignature ? keySignature.split(",") : [];
    return {
      existing: new Set(current.filter((key) => found.has(key))) as ReadonlySet<string>,
      missing: new Set(
        current.filter((key) => !isPossibleVariableKey(key) || (asked.has(key) && !found.has(key)))
      ) as ReadonlySet<string>
    };
  }, [data, keySignature]);
};

export const useListAgentVaultSkills = (
  projectId: string,
  params: TListAgentVaultSkillsDTO = {},
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.skillList(currentOrg.id, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultSkillPage>("/api/v1/agent-vault/skills", {
        params: { ...params, projectId }
      });
      return data;
    },
    placeholderData: keepPreviousInProject(projectId),
    enabled
  });
};

export const useGetAgentVaultSkill = (projectId: string, skillId: string) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.skill(currentOrg.id, projectId, skillId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ skill: TAgentVaultSkillDetail }>(
        `/api/v1/agent-vault/skills/${skillId}`
      );
      return data.skill;
    },
    enabled: Boolean(skillId)
  });
};

export const useListAgentVaultSkillVersions = (projectId: string, skillId: string) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.skillVersions(currentOrg.id, projectId, skillId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ versions: TAgentVaultSkillVersion[] }>(
        `/api/v1/agent-vault/skills/${skillId}/versions`
      );
      return data.versions;
    },
    enabled: Boolean(skillId)
  });
};

export const fetchAgentVaultSkillVersion = async (skillId: string, version: number) => {
  const { data } = await apiRequest.get<{ version: TAgentVaultSkillVersionWithFiles }>(
    `/api/v1/agent-vault/skills/${skillId}/versions/${version}`
  );
  return data.version;
};

export const useGetAgentVaultSkillVersion = (
  projectId: string,
  skillId: string,
  version?: number
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.skillVersion(currentOrg.id, projectId, skillId, version ?? 0),
    queryFn: () => fetchAgentVaultSkillVersion(skillId, version ?? 0),
    enabled: Boolean(skillId) && Boolean(version),
    // A version never changes once published.
    staleTime: Infinity
  });
};

export const useListAgentVaultAccessBundleSkills = (
  projectId: string,
  accessBundleId: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundleSkills(currentOrg.id, projectId, accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ skills: TAgentVaultBundleSkill[] }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/skills`
      );
      return data.skills;
    },
    enabled: enabled && Boolean(accessBundleId)
  });
};
