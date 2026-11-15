import { isAxiosError } from "axios";

import type { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultProxyList,
  TAgentVaultSessionList,
  useListAgentVaultAccessBundles
} from "@app/hooks/api/agentVault/queries";
import type {
  TAddAgentVaultMembersDTO,
  TAddAgentVaultProductMembersDTO,
  TAgentVaultDelegationDetail,
  TAgentVaultMintedSession,
  TAgentVaultOauthAuthorization,
  TAgentVaultSession,
  TCompleteAgentVaultOauthAuthorizationDTO,
  TCreateAgentVaultSessionDTO,
  TListAgentVaultProxiesDTO,
  TUpdateAgentVaultSessionLabelDTO,
  TAgentVaultProductMember,
  TChangeAgentVaultDelegationSubjectsDTO,
  TSetAgentVaultDelegationDTO,
  TAgentVaultActorIdsDTO,
  TAgentVaultActorRef,
  TAgentVaultMemberWriteResult,
  TAgentVaultProductActor,
  TAgentVaultProductMemberOf,
  TAgentVaultWrittenMember,
  TListAgentVaultAccessBundlesDTO,
  TListAgentVaultMembersDTO,
  TListAgentVaultSessionsDTO,
  TUpdateAgentVaultMemberRolesDTO
} from "@app/hooks/api/agentVault/types";
import type { IdentityUniversalAuth } from "@app/hooks/api/identities/types";
import type { TGetUserProjectPermissionDTO } from "@app/hooks/api/roles/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TAgentVaultAccessBundleList = NonNullable<
  ReturnType<typeof useListAgentVaultAccessBundles>["data"]
>;

export const isNoUniversalAuthError = (error: unknown) =>
  isAxiosError<{ message?: string }>(error) &&
  (error.response?.status === 404 || error.response?.status === 400) &&
  /universal auth/i.test(error.response?.data?.message ?? "");

export type TAgentVaultMemberList<T extends AgentVaultMemberType> = {
  members: TAgentVaultProductMemberOf<T>[];
  totalCount: number;
};

export type TAgentVaultAvailableList<T extends AgentVaultMemberType> = {
  actors: Extract<TAgentVaultProductActor, { type: T }>[];
  totalCount: number;
};

export type AgentVaultAdapter = {
  useProjectPermission: (
    dto: TGetUserProjectPermissionDTO
  ) => V4QueryResult<{ memberships: { roles: { role: string }[] }[] }>;
  useSessions: (
    orgId: string,
    projectId: string,
    params: TListAgentVaultSessionsDTO,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TAgentVaultSessionList>;
  useSession: (
    orgId: string,
    projectId: string,
    sessionId: string | undefined
  ) => V4QueryResult<TAgentVaultSession>;
  useCreateSession: (
    orgId: string,
    projectId: string
  ) => ReturnType<V4Mutation<TCreateAgentVaultSessionDTO, TAgentVaultMintedSession>>;
  useUpdateSessionLabel: (
    orgId: string,
    projectId: string
  ) => ReturnType<V4Mutation<TUpdateAgentVaultSessionLabelDTO, TAgentVaultSession>>;
  useRevokeSession: (
    orgId: string,
    projectId: string
  ) => ReturnType<V4Mutation<string, { id: string; revokedAt: string | null }>>;
  useProxies: (
    orgId: string,
    projectId: string,
    params: TListAgentVaultProxiesDTO,
    options?: { enabled?: boolean; refetchOnWindowFocus?: "always" }
  ) => V4QueryResult<TAgentVaultProxyList>;
  useAccessBundles: (
    orgId: string,
    projectId: string,
    params: TListAgentVaultAccessBundlesDTO,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TAgentVaultAccessBundleList> & { isFetching?: boolean };
  useIsAccessBundleMember: (
    orgId: string,
    projectId: string,
    accessBundleId: string,
    actor: { type: AgentVaultMemberType; id: string; name: string } | null
  ) => V4QueryResult<boolean>;
  useGrantAccessBundle: (
    orgId: string,
    projectId: string
  ) => ReturnType<V4Mutation<TAddAgentVaultMembersDTO>>;
  useIdentityUniversalAuth: (identityId: string) => V4QueryResult<IdentityUniversalAuth>;
  useMembers: <T extends AgentVaultMemberType>(
    projectId: string,
    params: TListAgentVaultMembersDTO & { actorType: T },
    enabled?: boolean
  ) => V4QueryResult<TAgentVaultMemberList<T>>;
  useAvailableMembers: <T extends AgentVaultMemberType>(
    projectId: string,
    params: TListAgentVaultMembersDTO & { actorType: T },
    enabled?: boolean
  ) => V4QueryResult<TAgentVaultAvailableList<T>>;
  useAddMembers: (
    projectId: string
  ) => ReturnType<
    V4Mutation<
      TAddAgentVaultProductMembersDTO,
      TAgentVaultMemberWriteResult<
        TAgentVaultWrittenMember,
        TAgentVaultActorRef & { identifier: string }
      >
    >
  >;
  useUpdateMemberRoles: (
    projectId: string
  ) => ReturnType<
    V4Mutation<
      TUpdateAgentVaultMemberRolesDTO,
      TAgentVaultMemberWriteResult<TAgentVaultWrittenMember>
    >
  >;
  useRevokeMembers: (
    projectId: string
  ) => ReturnType<
    V4Mutation<TAgentVaultActorIdsDTO, TAgentVaultMemberWriteResult<TAgentVaultActorRef>>
  >;
  useDeleteManagedIdentity: (projectId: string) => ReturnType<V4Mutation<{ identityId: string }>>;
  useDelegation: (
    projectId: string,
    machineIdentityId: string,
    enabled?: boolean
  ) => V4QueryResult<TAgentVaultDelegationDetail | null>;
  useAvailableDelegationSubjects: (
    projectId: string,
    machineIdentityId: string,
    params: TListAgentVaultMembersDTO,
    enabled?: boolean
  ) => V4QueryResult<{ members: TAgentVaultProductMember[]; totalCount: number }>;
  useSetDelegation: (
    projectId: string
  ) => ReturnType<V4Mutation<TSetAgentVaultDelegationDTO, TAgentVaultDelegationDetail>>;
  useDeleteDelegation: (projectId: string) => ReturnType<V4Mutation<{ machineIdentityId: string }>>;
  useAddDelegationSubjects: (
    projectId: string
  ) => ReturnType<V4Mutation<TChangeAgentVaultDelegationSubjectsDTO, TAgentVaultDelegationDetail>>;
  useRemoveDelegationSubjects: (
    projectId: string
  ) => ReturnType<
    V4Mutation<TChangeAgentVaultDelegationSubjectsDTO, TAgentVaultDelegationDetail | null>
  >;
  useCompleteOauthAuthorization: V4Mutation<
    TCompleteAgentVaultOauthAuthorizationDTO,
    TAgentVaultOauthAuthorization
  >;
};
