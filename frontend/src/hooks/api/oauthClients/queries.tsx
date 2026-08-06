import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { OauthGrantType, TOauthAuthorizeInfo, TOauthClient } from "./types";

export const oauthClientKeys = {
  allLists: (orgId: string) => [{ orgId }, "oauth-clients"] as const,
  list: (orgId: string, grantType?: OauthGrantType) =>
    [...oauthClientKeys.allLists(orgId), grantType ?? ""] as const,
  authorizeInfo: (clientId: string, redirectUri: string, scope?: string) =>
    ["oauth-authorize-info", clientId, redirectUri, scope ?? ""] as const
};

// `grantType` narrows the list to applications registered for one grant. The SSO page uses it to show
// which applications depend on the org's OIDC issuer.
export const useGetOauthClients = (orgId: string, grantType?: OauthGrantType) => {
  return useQuery({
    queryKey: oauthClientKeys.list(orgId, grantType),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ clients: TOauthClient[] }>("/api/v1/oauth/clients", {
        params: grantType ? { grantType } : undefined
      });
      return data.clients;
    },
    enabled: Boolean(orgId)
  });
};

export const useGetOauthAuthorizeInfo = (clientId: string, redirectUri: string, scope?: string) => {
  return useQuery({
    queryKey: oauthClientKeys.authorizeInfo(clientId, redirectUri, scope),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOauthAuthorizeInfo>("/api/v1/oauth/authorize/info", {
        params: {
          client_id: clientId,
          redirect_uri: redirectUri,
          ...(scope ? { scope } : {})
        }
      });
      return data;
    },
    enabled: Boolean(clientId) && Boolean(redirectUri),
    retry: false
  });
};
