import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAgentPolicy, TAgentPolicyTarget } from "./types";

export const agentPolicyQueryKeys = {
  list: (projectId: string) => [{ projectId }, "agent-policies"] as const,
  byId: (policyId: string) => [{ policyId }, "agent-policy"] as const,
  targets: () => ["agent-policy-targets"] as const
};

const fetchAgentPolicies = async (projectId: string) => {
  const { data } = await apiRequest.get<{ agentPolicies: TAgentPolicy[] }>(
    "/api/v1/agent-policies",
    { params: { projectId } }
  );
  return data.agentPolicies;
};

const fetchAgentPolicyTargets = async () => {
  const { data } = await apiRequest.get<{ targets: TAgentPolicyTarget[] }>(
    "/api/v1/agent-policies/targets"
  );
  return data.targets;
};

export const useGetAgentPolicies = (projectId: string) =>
  useQuery({
    queryKey: agentPolicyQueryKeys.list(projectId),
    queryFn: () => fetchAgentPolicies(projectId),
    enabled: Boolean(projectId)
  });

export const useGetAgentPolicyTargets = () =>
  useQuery({
    queryKey: agentPolicyQueryKeys.targets(),
    queryFn: fetchAgentPolicyTargets,
    // The registry is static for the life of the server build.
    staleTime: Infinity
  });
