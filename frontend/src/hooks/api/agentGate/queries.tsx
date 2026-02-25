import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAgentGateAuditLog,
  TAgentGatePolicy,
  TGetAgentPolicyDTO,
  TListAgentGatePoliciesDTO,
  TQueryAuditLogsDTO
} from "./types";

export const agentGateKeys = {
  all: ["agent-gate"] as const,
  policies: (params: { projectId: string }) => [...agentGateKeys.all, "policies", params] as const,
  agentPolicy: (params: { agentId: string; projectId: string }) =>
    [...agentGateKeys.all, "agent-policy", params] as const,
  auditLogs: (params: { projectId: string; limit?: number }) =>
    [...agentGateKeys.all, "audit-logs", params] as const
};

export const useListAgentGatePolicies = ({ projectId }: TListAgentGatePoliciesDTO) => {
  return useQuery({
    queryKey: agentGateKeys.policies({ projectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ policies: TAgentGatePolicy[] }>(
        "/api/v1/agentgate/policies",
        { params: { projectId } }
      );
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetAgentPolicy = ({ agentId, projectId }: TGetAgentPolicyDTO) => {
  return useQuery({
    queryKey: agentGateKeys.agentPolicy({ agentId, projectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentGatePolicy>(
        `/api/v1/agentgate/agents/${agentId}/policy`,
        { params: { projectId } }
      );
      return data;
    },
    enabled: Boolean(agentId) && Boolean(projectId)
  });
};

export const useQueryAgentGateAuditLogs = ({ projectId, limit = 50 }: TQueryAuditLogsDTO) => {
  return useQuery({
    queryKey: agentGateKeys.auditLogs({ projectId, limit }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ logs: TAgentGateAuditLog[] }>(
        "/api/v1/agentgate/audit",
        { params: { projectId, limit } }
      );
      return data;
    },
    enabled: Boolean(projectId),
    refetchInterval: 4000
  });
};
