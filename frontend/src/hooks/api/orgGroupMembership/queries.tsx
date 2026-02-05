import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAvailableOrganizationGroups, TListAvailableOrganizationGroupsDTO } from "./types";

export const orgGroupMembershipQuery = {
  allKey: () => ["organization-group-memberships"] as const,
  listAvailableKey: (params?: TListAvailableOrganizationGroupsDTO) =>
    [...orgGroupMembershipQuery.allKey(), "list-available", params] as const,
  listAvailable: (params: TListAvailableOrganizationGroupsDTO = {}) =>
    queryOptions({
      queryKey: orgGroupMembershipQuery.listAvailableKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          groups: TAvailableOrganizationGroups;
        }>("/api/v1/organization/available-groups", {
          params: {
            offset: params.offset,
            limit: params.limit
          }
        });
        return data.groups;
      }
    })
};
