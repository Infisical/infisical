import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { OIDCConfigData } from "./types";

export const oidcConfigKeys = {
  getOIDCConfig: (orgSlug: string) => [{ orgSlug }, "organization-oidc"] as const,
  getOIDCManageGroupMembershipsEnabled: (orgId: string) =>
    ["oidc-manage-group-memberships", orgId] as const
};

export const useGetOIDCConfig = (orgSlug: string) => {
  return useQuery({
    queryKey: oidcConfigKeys.getOIDCConfig(orgSlug),
    queryFn: async () => {
      try {
        const { data } = await apiRequest.get<OIDCConfigData>(
          `/api/v1/sso/oidc/config?orgSlug=${orgSlug}`
        );

        return data;
      } catch {
        return null;
      }
    },
    enabled: true
  });
};

export const useOidcManageGroupMembershipsEnabled = (orgId: string) => {
  return useQuery({
    queryKey: oidcConfigKeys.getOIDCManageGroupMembershipsEnabled(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ isEnabled: boolean }>(
        `/api/v1/sso/oidc/manage-group-memberships?orgId=${orgId}`
      );

      return data.isEnabled;
    }
  });
};
