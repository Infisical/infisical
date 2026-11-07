import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { TWebAppSession } from "./types";

export const webAppSessionKeys = {
  mine: (orgId: string) => ["pam", "web-app-sessions", orgId, "mine"] as const,
  session: (orgId: string, sessionId?: string) =>
    ["pam", "web-app-sessions", orgId, sessionId] as const
};
export const useGetMyWebAppSessions = (enabled = true) => {
  const { currentOrg } = useOrganization();
  return useQuery({
    queryKey: webAppSessionKeys.mine(currentOrg.id),
    enabled,
    staleTime: 0,
    queryFn: async () =>
      (await apiRequest.get<{ sessions: TWebAppSession[] }>("/api/v1/pam/web-app-sessions/mine"))
        .data.sessions,
    refetchInterval: 5000
  });
};
export const useGetWebAppSession = (sessionId?: string) => {
  const { currentOrg } = useOrganization();
  return useQuery({
    queryKey: webAppSessionKeys.session(currentOrg.id, sessionId),
    enabled: Boolean(sessionId),
    staleTime: 0,
    gcTime: 0,
    queryFn: async () =>
      (
        await apiRequest.get<{ session: TWebAppSession }>(
          `/api/v1/pam/web-app-sessions/${sessionId}`
        )
      ).data.session,
    refetchInterval: 3000
  });
};
