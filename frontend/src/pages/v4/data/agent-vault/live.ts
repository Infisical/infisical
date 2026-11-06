import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { agentVaultKeys, type TAgentVaultSessionList } from "@app/hooks/api/agentVault/queries";
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
    })
};
