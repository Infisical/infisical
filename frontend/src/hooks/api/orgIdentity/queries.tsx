import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetOrgIdentityByIdDTO, TListOrgIdentitiesDTO, TOrgIdentity } from "./types";

export const orgIdentityQuery = {
  allKey: () => ["organization-identities"] as const,
  getByIdKey: (params: TGetOrgIdentityByIdDTO) =>
    [...orgIdentityQuery.allKey(), "by-id", params] as const,
  listKey: (params?: TListOrgIdentitiesDTO) =>
    [...orgIdentityQuery.allKey(), "list", params] as const,
  getById: (params: TGetOrgIdentityByIdDTO) =>
    queryOptions({
      queryKey: orgIdentityQuery.getByIdKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identity: TOrgIdentity }>(
          `/api/v1/organization/identities/${params.identityId}`
        );
        return data.identity;
      }
    }),
  list: (params: TListOrgIdentitiesDTO = {}) =>
    queryOptions({
      queryKey: orgIdentityQuery.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identities: TOrgIdentity[];
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
