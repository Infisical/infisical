import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAgentSession } from "./types";

export const agentSessionQueryKeys = {
  list: (projectId: string) => [{ projectId }, "agent-sessions"] as const
};

const fetchAgentSessions = async (projectId: string) => {
  const { data } = await apiRequest.get<{ agentSessions: TAgentSession[] }>(
    "/api/v1/agent-sessions",
    { params: { projectId } }
  );
  return data.agentSessions;
};

export const useGetAgentSessions = (
  projectId: string,
  options?: { refetchInterval?: number; enabled?: boolean }
) =>
  useQuery({
    queryKey: agentSessionQueryKeys.list(projectId),
    queryFn: () => fetchAgentSessions(projectId),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    // A session's last-used stamp moves with every request the proxy handles, so the default 60s
    // staleTime would show a live agent as idle.
    staleTime: 0,
    refetchInterval: options?.refetchInterval
  });
