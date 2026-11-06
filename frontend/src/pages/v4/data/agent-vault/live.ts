import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { agentVaultKeys, type TAgentVaultSessionList } from "@app/hooks/api/agentVault/queries";
import { fetchUserWorkspaces } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";

import type { AgentVaultAdapter, TAgentVaultAccessBundleList } from "./contract";

const useFirstAgentVaultProjectId = (orgId: string) =>
  useQuery({
    queryKey: ["agent-vault", orgId, "first-project"],
    queryFn: async () => {
      const projects = await fetchUserWorkspaces(false, ProjectType.AgentVault);
      const project = projects[0];
      if (!project) throw new Error("No Agent Vault project in this organization yet.");
      return project.id;
    }
  });

export const agentVaultLive: AgentVaultAdapter = {
  useProjectId: useFirstAgentVaultProjectId,
  useProjectPermission: useGetUserProjectPermissions,
  useSessions: (orgId, params) => {
    const { data: projectId = "" } = useFirstAgentVaultProjectId(orgId);
    return useQuery({
      enabled: Boolean(projectId),
      refetchInterval: 30_000,
      placeholderData: (prev) => prev,
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
    });
  },
  useAccessBundles: (orgId, params) => {
    const { data: projectId = "" } = useFirstAgentVaultProjectId(orgId);
    return useQuery({
      enabled: Boolean(projectId),
      placeholderData: (prev) => prev,
      queryKey: agentVaultKeys.accessBundleList(orgId, projectId, params),
      queryFn: async () => {
        const { data } = await apiRequest.get<TAgentVaultAccessBundleList>(
          "/api/v1/agent-vault/access-bundles",
          { params: { ...params, projectId } }
        );
        return data;
      }
    });
  }
};
