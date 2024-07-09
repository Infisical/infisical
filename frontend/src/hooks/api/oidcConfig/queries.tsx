import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { OIDCConfigData } from "./types";

export const oidcConfigKeys = {
  getOIDCConfig: (orgSlug: string) => [{ orgSlug }, "organization-oidc"] as const
};

export const useGetOIDCConfig = (orgSlug: string) => {
  return useQuery({
    queryKey: oidcConfigKeys.getOIDCConfig(orgSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<OIDCConfigData>(
        `/api/v1/sso/oidc/config?orgSlug=${orgSlug}`
      );

      return data;
    },
    enabled: true
  });
};
