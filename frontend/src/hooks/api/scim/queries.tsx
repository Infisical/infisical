import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { GetScimEventsDTO, ScimEventData, ScimTokenData } from "./types";

export const scimKeys = {
  getScimTokens: (orgId: string) => [{ orgId }, "organization-scim-token"] as const,
  getScimEvents: (params: GetScimEventsDTO) => [{ ...params }, "organization-scim-events"] as const
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

export const useGetScimEvents = ({ since, limit = 10, offset, disabled }: GetScimEventsDTO) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: scimKeys.getScimEvents({ since, limit, offset }),
    queryFn: async ({ pageParam }) => {
      const {
        data: { scimEvents }
      } = await apiRequest.get<{ scimEvents: ScimEventData[] }>("/api/v1/scim/scim-events", {
        params: {
          since,
          limit,
          offset: pageParam
        }
      });

      return scimEvents;
    },
    enabled: !disabled,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * limit : undefined,
    placeholderData: (prev) => prev
  });
};
