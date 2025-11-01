import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAvailableOrganizationIdentities,
  TListAvailableOrganizationIdentitiesDTO,
  TListOrgIdentityMembershipsDTO
} from "./types";

export const orgIdentityMembershipQuery = {
  allKey: () => ["organization-identity-memberships"] as const,
  listAvailableKey: (params?: TListOrgIdentityMembershipsDTO) =>
    [...orgIdentityMembershipQuery.allKey(), "list-available", params] as const,
  listAvailable: (params: TListAvailableOrganizationIdentitiesDTO = {}) =>
    queryOptions({
      queryKey: orgIdentityMembershipQuery.listAvailableKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identities: TAvailableOrganizationIdentities;
        }>("/api/v1/organization/available-identities", {
          params: {
            offset: params.offset,
            limit: params.limit,
            identityName: params.identityName
          }
        });
        return data.identities;
      }
    })
};
