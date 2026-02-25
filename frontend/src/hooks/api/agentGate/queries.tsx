import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAgentGatePolicy, TGetAgentPolicyDTO, TListAgentGatePoliciesDTO } from "./types";

export const agentGateKeys = {
  all: ["agent-gate"] as const,
  policies: (params: { projectId: string }) => [...agentGateKeys.all, "policies", params] as const,
  agentPolicy: (params: { agentId: string; projectId: string }) =>
    [...agentGateKeys.all, "agent-policy", params] as const
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
