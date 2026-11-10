import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  agentVaultKeys,
  fetchAgentVaultSessionLogReadAccess
} from "@app/hooks/api/agentVault/queries";
import type {
  TAgentVaultSessionLogHealth,
  TAgentVaultSessionLogSettingsState,
  TUpdateAgentVaultSessionLogSettingsDTO
} from "@app/hooks/api/agentVault/types";
import {
  useCreateAppConnection,
  useDeleteAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections/mutations";
import {
  useListAppConnections,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { AgentVaultSettingsAdapter } from "./contract";

export const agentVaultSettingsLive: AgentVaultSettingsAdapter = {
  useSessionLogPlan: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return {
      data: data && {
        agentVaultManagedStorage: data.agentVaultManagedStorage,
        agentVaultByoS3: data.agentVaultByoS3,
        agentVaultSessionLogRetentionDays: data.agentVaultSessionLogRetentionDays
      },
      isPending,
      error
    };
  },
  useSessionLogSettings: (orgId, projectId) =>
    useQuery({
      queryKey: agentVaultKeys.sessionLogSettings(orgId, projectId),
      queryFn: async () => {
        const { data } = await apiRequest.get<TAgentVaultSessionLogSettingsState>(
          "/api/v1/agent-vault/settings/session-logs",
          { params: { projectId } }
        );
        return data;
      }
    }),
  useSessionLogHealth: (orgId, projectId) =>
    useQuery({
      queryKey: agentVaultKeys.sessionLogHealth(orgId, projectId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ health: TAgentVaultSessionLogHealth }>(
          "/api/v1/agent-vault/settings/session-logs/health",
          { params: { projectId } }
        );
        return data.health;
      }
    }),
  useSessionLogReadCheck: (orgId, projectId, enabled = true) =>
    useQuery({
      queryKey: agentVaultKeys.sessionLogCorsProbe(orgId, projectId),
      queryFn: () => fetchAgentVaultSessionLogReadAccess(projectId),
      enabled,
      retry: false
    }),
  useSessionLogReadCheckActions: (orgId, projectId) => {
    const queryClient = useQueryClient();
    const queryKey = agentVaultKeys.sessionLogCorsProbe(orgId, projectId);
    return {
      fetch: () =>
        queryClient
          .fetchQuery({ queryKey, queryFn: () => fetchAgentVaultSessionLogReadAccess(projectId) })
          .catch(() => null),
      recheck: () => {
        queryClient.invalidateQueries({ queryKey });
      }
    };
  },
  useUpdateSessionLogSettings: (orgId, projectId) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (params: TUpdateAgentVaultSessionLogSettingsDTO) => {
        const { data } = await apiRequest.patch<TAgentVaultSessionLogSettingsState>(
          "/api/v1/agent-vault/settings/session-logs",
          params,
          { params: { projectId } }
        );
        return data;
      },
      onSuccess: (state) => {
        queryClient.setQueryData(agentVaultKeys.sessionLogSettings(orgId, projectId), state);
        // Reset, not invalidate: the cached result may be for the previous bucket.
        queryClient.resetQueries({
          queryKey: agentVaultKeys.sessionLogCorsProbe(orgId, projectId)
        });
        queryClient.invalidateQueries({
          queryKey: agentVaultKeys.sessionLogHealth(orgId, projectId)
        });
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions(orgId, projectId) });
      }
    });
  },
  useProjectConnections: useListAppConnections,
  useAvailableConnections: useListAvailableAppConnections,
  useCreateConnection: useCreateAppConnection,
  useUpdateConnection: useUpdateAppConnection,
  useDeleteConnection: useDeleteAppConnection
};
