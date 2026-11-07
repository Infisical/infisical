import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { webAppSessionKeys } from "./queries";
import { TCreateWebAppSession, TWebAppSession } from "./types";

export const createWebAppSession = async (input: TCreateWebAppSession) =>
  (await apiRequest.post<{ session: TWebAppSession }>("/api/v1/pam/web-app-sessions", input)).data
    .session;
export const createWebAppAttachTicket = async (sessionId: string, takeControl: boolean) =>
  (
    await apiRequest.post<{ ticket: string }>(
      `/api/v1/pam/web-app-sessions/${sessionId}/attach-tickets`,
      { takeControl }
    )
  ).data.ticket;
export const useEndWebAppSession = () => {
  const { currentOrg } = useOrganization();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) =>
      (
        await apiRequest.post<{ session: TWebAppSession }>(
          `/api/v1/pam/web-app-sessions/${sessionId}/end`
        )
      ).data.session,
    onSuccess: (session) => {
      client.setQueryData(webAppSessionKeys.session(currentOrg.id, session.id), session);
      client.invalidateQueries({ queryKey: webAppSessionKeys.mine(currentOrg.id) });
    }
  });
};
