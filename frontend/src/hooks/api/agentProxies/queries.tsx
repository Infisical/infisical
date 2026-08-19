import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAgentProxy } from "./types";

export const agentProxyQueryKeys = {
  list: () => ["agent-proxies"] as const,
  byId: (agentProxyId: string) => [{ agentProxyId }, "agent-proxy"] as const
};

const fetchAgentProxies = async () => {
  const { data } = await apiRequest.get<{ agentProxies: TAgentProxy[] }>("/api/v1/agent-proxies");
  return data.agentProxies;
};

const fetchAgentProxyById = async (agentProxyId: string) => {
  const { data } = await apiRequest.get<{ agentProxy: TAgentProxy }>(
    `/api/v1/agent-proxies/${agentProxyId}`
  );
  return data.agentProxy;
};

export const useGetAgentProxies = () =>
  useQuery({
    queryKey: agentProxyQueryKeys.list(),
    queryFn: fetchAgentProxies
  });

export const useGetAgentProxyById = (agentProxyId: string) =>
  useQuery({
    queryKey: agentProxyQueryKeys.byId(agentProxyId),
    queryFn: () => fetchAgentProxyById(agentProxyId),
    enabled: Boolean(agentProxyId)
  });
