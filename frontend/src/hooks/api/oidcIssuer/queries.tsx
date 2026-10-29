import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export const oidcIssuerKeys = {
  getIssuerUrl: (orgId: string) => [{ orgId }, "oidc-issuer-url"] as const
};

// Read from the discovery document, because the issuer is built from SITE_URL, which can differ from the
// address the browser uses
export const useGetOidcIssuerUrl = (
  orgId: string,
  options?: Omit<
    UseQueryOptions<string, unknown, string, ReturnType<typeof oidcIssuerKeys.getIssuerUrl>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: oidcIssuerKeys.getIssuerUrl(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ issuer: string }>(
        `/api/v1/oidc-issuer/organizations/${orgId}/.well-known/openid-configuration`,
        // The document is cached for an hour for providers, but the form must show the issuer tokens use now
        { headers: { "Cache-Control": "no-cache" } }
      );

      return data.issuer;
    },
    ...options
  });
};
