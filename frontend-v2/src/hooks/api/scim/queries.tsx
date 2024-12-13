import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ScimTokenData } from "./types";

export const scimKeys = {
  getScimTokens: (orgId: string) => [{ orgId }, "organization-scim-token"] as const
};

export const useGetScimTokens = (organizationId: string) => {
  return useQuery({
    queryKey: scimKeys.getScimTokens(organizationId),
    queryFn: async () => {
      if (organizationId === "") {
        return undefined;
      }

      const {
        data: { scimTokens }
      } = await apiRequest.get<{ scimTokens: ScimTokenData[] }>(
        `/api/v1/scim/scim-tokens?organizationId=${organizationId}`
      );

      return scimTokens;
    },
    enabled: true
  });
};
