import type { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultSessionList,
  useListAgentVaultAccessBundles
} from "@app/hooks/api/agentVault/queries";
import type {
  TAddAgentVaultProductMembersDTO,
  TAgentVaultDelegationDetail,
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
import type { TGetUserProjectPermissionDTO } from "@app/hooks/api/roles/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TAgentVaultAccessBundleList = NonNullable<
  ReturnType<typeof useListAgentVaultAccessBundles>["data"]
>;

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
    params: TListAgentVaultSessionsDTO
  ) => V4QueryResult<TAgentVaultSessionList>;
  useAccessBundles: (
    orgId: string,
    projectId: string,
    params: TListAgentVaultAccessBundlesDTO
  ) => V4QueryResult<TAgentVaultAccessBundleList>;
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
};
