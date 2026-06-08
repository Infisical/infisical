import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TOauthAuthorizeInfo, TOauthClient } from "./types";

export const oauthClientKeys = {
  list: (orgId: string) => [{ orgId }, "oauth-clients"] as const,
  authorizeInfo: (clientId: string, redirectUri: string) =>
    ["oauth-authorize-info", clientId, redirectUri] as const,
  all: ["oauth-clients"] as const
};

export const useGetOauthClients = (orgId: string) => {
  return useQuery({
    queryKey: oauthClientKeys.list(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ clients: TOauthClient[] }>("/api/v1/oauth/clients");
      return data.clients;
    },
    enabled: Boolean(orgId)
  });
};

export const useGetOauthAuthorizeInfo = (clientId: string, redirectUri: string) => {
  return useQuery({
    queryKey: oauthClientKeys.authorizeInfo(clientId, redirectUri),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOauthAuthorizeInfo>("/api/v1/oauth/authorize/info", {
        params: {
          client_id: clientId,
          redirect_uri: redirectUri
        }
      });
      return data;
    },
    enabled: Boolean(clientId) && Boolean(redirectUri),
    retry: false
  });
};
