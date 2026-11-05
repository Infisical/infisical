import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  agentVaultKeys,
  fetchAgentVaultProjectId,
  type TAgentVaultSessionList
} from "@app/hooks/api/agentVault/queries";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";

import type { AgentVaultAdapter, TAgentVaultAccessBundleList } from "./contract";

export const agentVaultLive: AgentVaultAdapter = {
  useProjectId: (orgId) =>
    useQuery({
      queryKey: [...agentVaultKeys.all(orgId), "project"],
      queryFn: fetchAgentVaultProjectId
    }),
  useProjectPermission: useGetUserProjectPermissions,
  useSessions: (orgId, params) =>
    useQuery({
      refetchInterval: 30_000,
      placeholderData: (prev) => prev,
      queryKey: agentVaultKeys.sessionList(orgId, params),
      queryFn: async () => {
        const { statuses, ...rest } = params;
        const { data } = await apiRequest.get<TAgentVaultSessionList>(
          "/api/v1/agent-vault/sessions",
          { params: { ...rest, status: statuses?.length ? statuses.join(",") : undefined } }
        );
        return data;
      }
    }),
  useAccessBundles: (orgId, params) =>
    useQuery({
      placeholderData: (prev) => prev,
      queryKey: agentVaultKeys.accessBundleList(orgId, params),
      queryFn: async () => {
        const { data } = await apiRequest.get<TAgentVaultAccessBundleList>(
          "/api/v1/agent-vault/access-bundles",
          { params }
        );
        return data;
      }
    })
};
