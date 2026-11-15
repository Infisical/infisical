import { useMemo, useState } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { isAxiosError } from "axios";

import { apiRequest } from "@app/config/request";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import {
  AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS,
  agentVaultKeys,
  getSessionLogStorageError,
  type TAgentVaultProxyList,
  type TAgentVaultSessionList
} from "@app/hooks/api/agentVault/queries";
import {
  createSessionLogChunkCache,
  decryptSessionLogPage,
  doesGapFillLeaveAHole,
  isLiveGapPossible,
  isRetryableResult,
  mergeSessionLogPages,
  SESSION_LOG_UPLOAD_GRACE_MS,
  sessionLogChunkKey
} from "@app/hooks/api/agentVault/sessionLogDecrypt";
import type {
  TAddAgentVaultMembersDTO,
  TAddAgentVaultProductMembersDTO,
  TAgentVaultMintedSession,
  TAgentVaultSession,
  TCreateAgentVaultSessionDTO,
  TUpdateAgentVaultSessionLabelDTO,
  TAgentVaultActorIdsDTO,
  TAgentVaultActorRef,
  TAgentVaultDecryptedSessionLogPage,
  TAgentVaultDelegation,
  TAgentVaultDelegationDetail,
  TAgentVaultSessionLogHistoryPage,
  TAgentVaultSessionLogTailPage,
  TAgentVaultMemberWriteResult,
  TAgentVaultProductActor,
  TAgentVaultProductMember,
  TAgentVaultProductMemberOf,
  TAgentVaultWrittenMember,
  TChangeAgentVaultDelegationSubjectsDTO,
  TListAgentVaultMembersDTO,
  TSetAgentVaultDelegationDTO,
  TUpdateAgentVaultMemberRolesDTO
} from "@app/hooks/api/agentVault/types";
import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities/mutations";
import { useGetIdentityUniversalAuth } from "@app/hooks/api/identities/queries";
import {
  useCreateProjectIdentity,
  useDeleteProjectIdentity,
  useUpdateProjectIdentity
} from "@app/hooks/api/projectIdentity";
import {
  projectIdentityMembershipQuery,
  useListProjectIdentityMemberships
} from "@app/hooks/api/projectIdentityMembership/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";

import {
  type AgentVaultAdapter,
  isNoUniversalAuthError,
  type TAgentVaultAccessBundleList,
  type TAgentVaultSessionLogs
} from "./contract";

const AVAILABLE_MEMBER_LIMIT = 50;
const MEMBER_CHECK_PAGE_SIZE = 100;

const findAccessBundleMember = async (
  accessBundleId: string,
  actor: { type: AgentVaultMemberType; id: string; name: string },
  offset = 0
): Promise<boolean> => {
  const { data } = await apiRequest.get<{ members: { id: string }[]; totalCount: number }>(
    `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`,
    {
      params: {
        actorType: actor.type,
        search: actor.name,
        limit: MEMBER_CHECK_PAGE_SIZE,
        offset
      }
    }
  );
  if (data.members.some((member) => member.id === actor.id)) return true;
  const nextOffset = offset + data.members.length;
  if (data.members.length < MEMBER_CHECK_PAGE_SIZE || nextOffset >= data.totalCount) return false;
  return findAccessBundleMember(accessBundleId, actor, nextOffset);
};

const useInvalidateSessions = (orgId: string, projectId: string) => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions(orgId, projectId) });
};

const useOrgId = () => useParams({ from: "/v4/organizations/$orgId" }).orgId;

const useInvalidateMembers = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(orgId, projectId) });
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId, projectId) });
  };
};

const useWriteDelegationResult = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return async (machineIdentityId: string, delegation: TAgentVaultDelegationDetail | null) => {
    const queryKey = agentVaultKeys.delegation(orgId, projectId, machineIdentityId);
    await queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData(queryKey, delegation);
    await queryClient.invalidateQueries({
      queryKey: agentVaultKeys.availableDelegationSubjects(orgId, projectId, machineIdentityId)
    });
  };
};

const SESSION_LOG_GAP_FILL_INTERVAL_MS = 60_000;

type THistoryPage = TAgentVaultDecryptedSessionLogPage<TAgentVaultSessionLogHistoryPage>;
type TTailPage = TAgentVaultDecryptedSessionLogPage<TAgentVaultSessionLogTailPage>;

const useSessionLogs = (
  orgId: string,
  projectId: string,
  sessionId: string,
  { isLive, from, to }: { isLive: boolean; from?: Date; to?: Date }
): TAgentVaultSessionLogs => {
  const queryClient = useQueryClient();
  const range = { from: from?.toISOString(), to: to?.toISOString() };
  const rangeParams = {
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {})
  };
  const url = `/api/v1/agent-vault/sessions/${sessionId}/logs`;

  const tracking = useMemo(
    () => ({
      cache: createSessionLogChunkCache(sessionId),
      lastGapFillAt: 0,
      isGapPending: false
    }),
    [sessionId]
  );
  const [unfilledGap, setUnfilledGap] = useState<{ sessionId: string; foundAt: number } | null>(
    null
  );

  const historyKey = agentVaultKeys.sessionLogs(orgId, projectId, sessionId, range);
  const history = useInfiniteQuery({
    queryKey: historyKey,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { cache } = tracking;
      const startedAt = Date.now();
      const { data } = await apiRequest.get<TAgentVaultSessionLogHistoryPage>(url, {
        params: { ...(pageParam ? { cursor: pageParam } : {}), ...rangeParams },
        signal
      });
      if (!pageParam) setUnfilledGap((gap) => (gap && gap.foundAt < startedAt ? null : gap));
      return decryptSessionLogPage(data, cache, signal);
    },
    retry: (failureCount, error) => !getSessionLogStorageError(error) && failureCount < 1,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey.includes(sessionId) ? prev : undefined,
    staleTime: 0,
    gcTime: 0
  });

  const isHistoryLoaded = Boolean(history.data) && !history.isPlaceholderData;
  const canReceive =
    history.data?.pages[0]?.sessionLogs.enabled !== false &&
    history.data?.pages[0]?.sessionLogs.isRecordable !== false;
  const liveKey = agentVaultKeys.sessionLogsLive(orgId, projectId, sessionId, range);

  const live = useQuery({
    queryKey: liveKey,
    enabled: isLive && canReceive && isHistoryLoaded,
    queryFn: async ({ signal }) => {
      const { cache } = tracking;
      let arrived = queryClient.getQueryData<TTailPage>(liveKey);

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
      const { data } = await apiRequest.get<TAgentVaultSessionLogTailPage>(`${url}/tail`, {
        params: arrived ? { cursor: arrived.nextCursor } : {},
        signal
      });

      const polledAt = Date.now();
      if (isLiveGapPossible({ lastPolledAt, now: polledAt, newChunkCount: data.chunks.length }))
        tracking.isGapPending = true;
      if (
        tracking.isGapPending &&
        polledAt - tracking.lastGapFillAt > SESSION_LOG_GAP_FILL_INTERVAL_MS
      ) {
        try {
          const { data: newest } = await apiRequest.get<TAgentVaultSessionLogHistoryPage>(url, {
            params: rangeParams,
            signal
          });
          const shown = new Set(
            [
              ...(arrived?.chunks ?? []),
              ...(
                queryClient.getQueryData<InfiniteData<THistoryPage>>(historyKey)?.pages ?? []
              ).flatMap((page) => page.chunks)
            ].map(sessionLogChunkKey)
          );
          const isGapUnfilled = doesGapFillLeaveAHole(newest, shown);
          arrived = mergeSessionLogPages(
            arrived,
            await decryptSessionLogPage({ ...newest, nextCursor: data.nextCursor }, cache, signal)
          );
          tracking.lastGapFillAt = polledAt;
          tracking.isGapPending = false;
          if (isGapUnfilled) setUnfilledGap({ sessionId, foundAt: Date.now() });
        } catch (error) {
          if (signal.aborted) throw error;
        }
      }

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
    history: {
      data: history.data,
      error: history.error,
      isPending: history.isPending,
      isPlaceholderData: history.isPlaceholderData,
      isError: history.isError,
      isFetching: history.isFetching,
      isRefetching: history.isRefetching,
      hasNextPage: history.hasNextPage,
      isFetchingNextPage: history.isFetchingNextPage,
      isFetchNextPageError: history.isFetchNextPageError,
      refetch: history.refetch,
      fetchNextPage: history.fetchNextPage
    },
    live: { isError: live.isError, isFetching: live.isFetching, refetch: live.refetch },
    arrived: live.data,
    isLiveGapUnfilled: unfilledGap?.sessionId === sessionId
  };
};

const keepPreviousInProject =
  (projectId: string) =>
  <T>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }) =>
    prevQuery?.queryKey[2] === projectId ? prev : undefined;

export const agentVaultLive: AgentVaultAdapter = {
  useProjectPermission: useGetUserProjectPermissions,
  useSessions: (orgId, projectId, params, options) =>
    useQuery({
      enabled: options?.enabled ?? true,
      refetchInterval: 30_000,
      placeholderData: keepPreviousInProject(projectId),
      queryKey: agentVaultKeys.sessionList(orgId, projectId, params),
      queryFn: async () => {
        const { statuses, ...rest } = params;
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
    }),
  useSession: (orgId, projectId, sessionId) =>
    useQuery({
      queryKey: agentVaultKeys.session(orgId, projectId, sessionId ?? ""),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ session: TAgentVaultSession }>(
          `/api/v1/agent-vault/sessions/${sessionId}`
        );
        return data.session;
      },
      enabled: Boolean(sessionId),
      refetchInterval: 30_000,
      retry: false
    }),
  useCreateSession: (orgId, projectId) => {
    const invalidate = useInvalidateSessions(orgId, projectId);
    return useMutation({
      mutationFn: async (dto: TCreateAgentVaultSessionDTO) => {
        const { data } = await apiRequest.post<{ session: TAgentVaultMintedSession }>(
          "/api/v1/agent-vault/sessions",
          { ...dto, projectId }
        );
        return data.session;
      },
      onSuccess: invalidate
    });
  },
  useUpdateSessionLabel: (orgId, projectId) => {
    const invalidate = useInvalidateSessions(orgId, projectId);
    return useMutation({
      mutationFn: async ({ sessionId, label }: TUpdateAgentVaultSessionLabelDTO) => {
        const { data } = await apiRequest.patch<{ session: TAgentVaultSession }>(
          `/api/v1/agent-vault/sessions/${sessionId}`,
          { label }
        );
        return data.session;
      },
      onSuccess: invalidate
    });
  },
  useRevokeSession: (orgId, projectId) => {
    const invalidate = useInvalidateSessions(orgId, projectId);
    return useMutation({
      mutationFn: async (sessionId: string) => {
        const { data } = await apiRequest.post<{
          session: { id: string; revokedAt: string | null };
        }>(`/api/v1/agent-vault/sessions/${sessionId}/revoke`);
        return data.session;
      },
      onSuccess: invalidate
    });
  },
  useSessionLogs,
  useAssignableIdentities: (projectId, enabled) => {
    const available = useQuery({
      ...projectIdentityMembershipQuery.listAvailable({
        projectId,
        projectType: ProjectType.AgentVault
      }),
      enabled,
      refetchOnMount: "always"
    });
    const memberships = useListProjectIdentityMemberships(
      { projectId, projectType: ProjectType.AgentVault, limit: 1000 },
      { enabled, refetchOnMount: "always" }
    );
    const isReady = available.isFetchedAfterMount && memberships.isFetchedAfterMount;
    const members = new Set(
      (memberships.data?.identityMemberships ?? []).map((membership) => membership.identity.id)
    );
    return {
      data: isReady
        ? (available.data ?? [])
            .filter((identity) => !members.has(identity.id))
            .map(({ id, name }) => ({ id, name }))
        : undefined,
      isPending: !isReady,
      error: available.error ?? memberships.error
    };
  },
  useCreateManagedIdentity: (projectId) => {
    const invalidate = useInvalidateMembers(projectId);
    const createIdentity = useCreateProjectIdentity();
    const addUniversalAuth = useAddIdentityUniversalAuth();
    return useMutation({
      mutationFn: async ({ name, role }: { name: string; role: string }) => {
        const identity = await createIdentity.mutateAsync({
          projectId,
          name,
          hasDeleteProtection: true,
          roles: [{ role }]
        });
        let authAttachFailed = false;
        try {
          await addUniversalAuth.mutateAsync({
            projectId,
            identityId: identity.id,
            ...UNIVERSAL_AUTH_DEFAULTS
          });
        } catch {
          authAttachFailed = true;
        }
        return { id: identity.id, name: identity.name, authAttachFailed };
      },
      onSuccess: invalidate
    });
  },
  useProxies: (orgId, projectId, params, options) =>
    useQuery({
      refetchInterval: 30_000,
      placeholderData: keepPreviousInProject(projectId),
      enabled: options?.enabled ?? true,
      refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
      queryKey: agentVaultKeys.proxyList(orgId, projectId, params),
      queryFn: async () => {
        const { data } = await apiRequest.get<TAgentVaultProxyList>("/api/v1/agent-vault/proxies", {
          params: { ...params, projectId }
        });
        return data;
      }
    }),
  useAccessBundles: (orgId, projectId, params, options) =>
    useQuery({
      enabled: options?.enabled ?? true,
      placeholderData: keepPreviousInProject(projectId),
      queryKey: agentVaultKeys.accessBundleList(orgId, projectId, params),
      queryFn: async () => {
        const { data } = await apiRequest.get<TAgentVaultAccessBundleList>(
          "/api/v1/agent-vault/access-bundles",
          { params: { ...params, projectId } }
        );
        return data;
      }
    }),
  useIsAccessBundleMember: (orgId, projectId, accessBundleId, actor) =>
    useQuery({
      queryKey: agentVaultKeys.accessBundleMemberCheck(
        orgId,
        projectId,
        accessBundleId,
        actor?.type ?? AgentVaultMemberType.MachineIdentity,
        actor?.id ?? ""
      ),
      queryFn: () => (actor ? findAccessBundleMember(accessBundleId, actor) : false),
      enabled: Boolean(accessBundleId && actor),
      refetchOnWindowFocus: "always"
    }),
  useGrantAccessBundle: (orgId, projectId) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMembersDTO) => {
        const { data } = await apiRequest.post(
          `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`,
          params
        );
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId, projectId) });
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.services(orgId, projectId) });
      }
    });
  },
  useIdentityUniversalAuth: (identityId) =>
    useGetIdentityUniversalAuth(identityId, {
      retry: (failureCount, error) => !isNoUniversalAuthError(error) && failureCount < 1,
      refetchOnWindowFocus: true
    }),
  useMembers: <T extends AgentVaultMemberType>(
    projectId: string,
    params: TListAgentVaultMembersDTO & { actorType: T },
    enabled = true
  ) => {
    const orgId = useOrgId();
    return useQuery({
      queryKey: agentVaultKeys.memberList(orgId, projectId, params),
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
  },
  useAvailableMembers: <T extends AgentVaultMemberType>(
    projectId: string,
    { limit = AVAILABLE_MEMBER_LIMIT, ...rest }: TListAgentVaultMembersDTO & { actorType: T },
    enabled = true
  ) => {
    const orgId = useOrgId();
    const params = { ...rest, limit };
    return useQuery({
      queryKey: agentVaultKeys.availableMemberList(orgId, projectId, params),
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
  },
  useAddMembers: (projectId) => {
    const invalidate = useInvalidateMembers(projectId);
    return useMutation({
      mutationFn: async (dto: TAddAgentVaultProductMembersDTO) => {
        const { data } = await apiRequest.post<
          TAgentVaultMemberWriteResult<
            TAgentVaultWrittenMember,
            TAgentVaultActorRef & { identifier: string }
          >
        >("/api/v1/agent-vault/members", { ...dto, projectId });
        return data;
      },
      onSuccess: invalidate
    });
  },
  useUpdateMemberRoles: (projectId) => {
    const invalidate = useInvalidateMembers(projectId);
    return useMutation({
      mutationFn: async (dto: TUpdateAgentVaultMemberRolesDTO) => {
        const { data } = await apiRequest.patch<
          TAgentVaultMemberWriteResult<TAgentVaultWrittenMember>
        >("/api/v1/agent-vault/members", { ...dto, projectId });
        return data;
      },
      onSuccess: invalidate
    });
  },
  useRevokeMembers: (projectId) => {
    const invalidate = useInvalidateMembers(projectId);
    return useMutation({
      mutationFn: async (dto: TAgentVaultActorIdsDTO) => {
        const { data } = await apiRequest.delete<TAgentVaultMemberWriteResult<TAgentVaultActorRef>>(
          "/api/v1/agent-vault/members",
          { data: { ...dto, projectId } }
        );
        return data;
      },
      onSuccess: invalidate
    });
  },
  useDeleteManagedIdentity: (projectId) => {
    const orgId = useOrgId();
    const queryClient = useQueryClient();
    const updateIdentity = useUpdateProjectIdentity();
    const deleteIdentity = useDeleteProjectIdentity();
    return {
      isPending: updateIdentity.isPending || deleteIdentity.isPending,
      mutateAsync: async ({ identityId }) => {
        await updateIdentity.mutateAsync({ identityId, projectId, hasDeleteProtection: false });
        await deleteIdentity.mutateAsync({ identityId, projectId });
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(orgId, projectId) });
      }
    };
  },
  useDelegation: (projectId, machineIdentityId, enabled = true) => {
    const orgId = useOrgId();
    return useQuery({
      queryKey: agentVaultKeys.delegation(orgId, projectId, machineIdentityId),
      queryFn: async () => {
        try {
          const { data } = await apiRequest.get<{ delegation: TAgentVaultDelegationDetail }>(
            `/api/v1/agent-vault/delegations/${machineIdentityId}`,
            { params: { projectId } }
          );
          return data.delegation;
        } catch (error) {
          if (isAxiosError(error) && error.response?.status === 404) return null;
          throw error;
        }
      },
      enabled,
      staleTime: 0
    });
  },
  useAvailableDelegationSubjects: (
    projectId,
    machineIdentityId,
    { limit = AVAILABLE_MEMBER_LIMIT, ...rest },
    enabled = true
  ) => {
    const orgId = useOrgId();
    const params = { ...rest, limit };
    return useQuery({
      queryKey: agentVaultKeys.availableDelegationSubjectList(
        orgId,
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
  },
  useSetDelegation: (projectId) => {
    const writeResult = useWriteDelegationResult(projectId);
    return useMutation({
      mutationFn: async ({ machineIdentityId, ...body }: TSetAgentVaultDelegationDTO) => {
        const { data } = await apiRequest.put<{ delegation: TAgentVaultDelegationDetail }>(
          `/api/v1/agent-vault/delegations/${machineIdentityId}`,
          body,
          { params: { projectId } }
        );
        return data.delegation;
      },
      onSuccess: (delegation, { machineIdentityId }) => writeResult(machineIdentityId, delegation)
    });
  },
  useDeleteDelegation: (projectId) => {
    const writeResult = useWriteDelegationResult(projectId);
    return useMutation({
      mutationFn: async ({ machineIdentityId }: { machineIdentityId: string }) => {
        const { data } = await apiRequest.delete<{ delegation: TAgentVaultDelegation }>(
          `/api/v1/agent-vault/delegations/${machineIdentityId}`,
          { params: { projectId } }
        );
        return data.delegation;
      },
      onSuccess: (_, { machineIdentityId }) => writeResult(machineIdentityId, null)
    });
  },
  useAddDelegationSubjects: (projectId) => {
    const writeResult = useWriteDelegationResult(projectId);
    return useMutation({
      mutationFn: async ({
        machineIdentityId,
        ...body
      }: TChangeAgentVaultDelegationSubjectsDTO) => {
        const { data } = await apiRequest.post<{ delegation: TAgentVaultDelegationDetail }>(
          `/api/v1/agent-vault/delegations/${machineIdentityId}/subjects`,
          body,
          { params: { projectId } }
        );
        return data.delegation;
      },
      onSuccess: (delegation, { machineIdentityId }) => writeResult(machineIdentityId, delegation)
    });
  },
  useRemoveDelegationSubjects: (projectId) => {
    const writeResult = useWriteDelegationResult(projectId);
    return useMutation({
      mutationFn: async ({
        machineIdentityId,
        ...body
      }: TChangeAgentVaultDelegationSubjectsDTO) => {
        const { data } = await apiRequest.delete<{
          delegation: TAgentVaultDelegationDetail | null;
        }>(`/api/v1/agent-vault/delegations/${machineIdentityId}/subjects`, {
          data: body,
          params: { projectId }
        });
        return data.delegation;
      },
      onSuccess: (delegation, { machineIdentityId }) => writeResult(machineIdentityId, delegation)
    });
  }
};
