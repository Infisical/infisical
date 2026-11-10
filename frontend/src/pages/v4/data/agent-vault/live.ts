import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";
import {
  useAddAgentVaultDelegationSubjects,
  useAddAgentVaultMembers,
  useDeleteAgentVaultDelegation,
  useRemoveAgentVaultDelegationSubjects,
  useSetAgentVaultDelegation,
  useRevokeAgentVaultMembers,
  useUpdateAgentVaultMemberRoles
} from "@app/hooks/api/agentVault/mutations";
import {
  agentVaultKeys,
  type TAgentVaultSessionList,
  useGetAgentVaultDelegation,
  useListAgentVaultMembers,
  useListAvailableAgentVaultDelegationSubjects,
  useListAvailableAgentVaultMembers
} from "@app/hooks/api/agentVault/queries";
import { useDeleteProjectIdentity, useUpdateProjectIdentity } from "@app/hooks/api/projectIdentity";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";

import type { AgentVaultAdapter, TAgentVaultAccessBundleList } from "./contract";

const keepPreviousInProject =
  (projectId: string) =>
  <T>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }) =>
    prevQuery?.queryKey[2] === projectId ? prev : undefined;

export const agentVaultLive: AgentVaultAdapter = {
  useProjectPermission: useGetUserProjectPermissions,
  useSessions: (orgId, projectId, params) =>
    useQuery({
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
  useAccessBundles: (orgId, projectId, params) =>
    useQuery({
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
  useMembers: useListAgentVaultMembers,
  useAvailableMembers: useListAvailableAgentVaultMembers,
  useAddMembers: useAddAgentVaultMembers,
  useUpdateMemberRoles: useUpdateAgentVaultMemberRoles,
  useRevokeMembers: useRevokeAgentVaultMembers,
  useDeleteManagedIdentity: (projectId) => {
    const { currentOrg } = useOrganization();
    const queryClient = useQueryClient();
    const updateIdentity = useUpdateProjectIdentity();
    const deleteIdentity = useDeleteProjectIdentity();
    return {
      isPending: updateIdentity.isPending || deleteIdentity.isPending,
      mutateAsync: async ({ identityId }) => {
        await updateIdentity.mutateAsync({ identityId, projectId, hasDeleteProtection: false });
        await deleteIdentity.mutateAsync({ identityId, projectId });
        queryClient.invalidateQueries({
          queryKey: agentVaultKeys.members(currentOrg.id, projectId)
        });
      }
    };
  },
  useDelegation: useGetAgentVaultDelegation,
  useAvailableDelegationSubjects: useListAvailableAgentVaultDelegationSubjects,
  useSetDelegation: useSetAgentVaultDelegation,
  useDeleteDelegation: useDeleteAgentVaultDelegation,
  useAddDelegationSubjects: useAddAgentVaultDelegationSubjects,
  useRemoveDelegationSubjects: useRemoveAgentVaultDelegationSubjects
};
