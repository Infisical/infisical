import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetOrganizationIdentityByIdDTO,
  TListOrganizationIdentitiesDTO,
  TOrganizationIdentity
} from "./types";

export const organizationIdentityQuery = {
  allKey: () => ["organization-identities"] as const,
  getByIdKey: (params: TGetOrganizationIdentityByIdDTO) =>
    [...organizationIdentityQuery.allKey(), "by-id", params] as const,
  listKey: (params?: TListOrganizationIdentitiesDTO) =>
    [...organizationIdentityQuery.allKey(), "list", params] as const,
  getById: (params: TGetOrganizationIdentityByIdDTO) =>
    queryOptions({
      queryKey: organizationIdentityQuery.getByIdKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identity: TOrganizationIdentity }>(
          `/api/v1/organization/identities/${params.identityId}`
        );
        return data.identity;
      }
    }),
  list: (params: TListOrganizationIdentitiesDTO = {}) =>
    queryOptions({
      queryKey: organizationIdentityQuery.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identities: TOrganizationIdentity[];
          totalCount: number;
        }>("/api/v1/organization/identities", {
          params: {
            offset: params.offset,
            limit: params.limit,
            search: params.search
          }
        });
        return data;
      }
    })
};
