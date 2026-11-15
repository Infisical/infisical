import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { isAxiosError } from "axios";

import { apiRequest } from "@app/config/request";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { useCompleteAgentVaultOauthAuthorization } from "@app/hooks/api/agentVault/mutations";
import {
  agentVaultKeys,
  type TAgentVaultProxyList,
  type TAgentVaultSessionList
} from "@app/hooks/api/agentVault/queries";
import type {
  TAddAgentVaultMembersDTO,
  TAddAgentVaultProductMembersDTO,
  TAgentVaultMintedSession,
  TAgentVaultSession,
  TCreateAgentVaultSessionDTO,
  TUpdateAgentVaultSessionLabelDTO,
  TAgentVaultActorIdsDTO,
  TAgentVaultActorRef,
  TAgentVaultDelegation,
  TAgentVaultDelegationDetail,
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
import { useGetIdentityUniversalAuth } from "@app/hooks/api/identities/queries";
import { useDeleteProjectIdentity, useUpdateProjectIdentity } from "@app/hooks/api/projectIdentity";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";

import {
  type AgentVaultAdapter,
  isNoUniversalAuthError,
  type TAgentVaultAccessBundleList
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

const keepPreviousInProject =
  (projectId: string) =>
  <T>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }) =>
    prevQuery?.queryKey[2] === projectId ? prev : undefined;

export const agentVaultLive: AgentVaultAdapter = {
  useProjectPermission: useGetUserProjectPermissions,
  useSessions: (orgId, projectId, params, options) =>
    useQuery({
      enabled: options?.enabled ?? true,
      refetchInterval: (query) =>
        query.state.data && options?.pollUntil?.(query.state.data) ? false : 30_000,
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
  useProxies: (orgId, projectId, params, options) =>
    useQuery({
      refetchInterval: (query) =>
        query.state.data && options?.pollUntil?.(query.state.data) ? false : 30_000,
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
  },
  useCompleteOauthAuthorization: useCompleteAgentVaultOauthAuthorization
};
