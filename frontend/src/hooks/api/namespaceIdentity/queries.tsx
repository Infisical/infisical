import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetNamespaceIdentityMembershipByIdDTO,
  TListNamespaceIdentityMembershipsDTO,
  TNamespaceIdentityMembership,
  TSearchNamespaceIdentitiesDTO
} from "./types";

export const namespaceIdentityQueryKeys = {
  allKey: () => ["namespace-identity"],
  searchKey: (params: TSearchNamespaceIdentitiesDTO) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "search",
    params.namespaceId,
    params
  ],
  listKey: (params: TListNamespaceIdentityMembershipsDTO) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "list",
    params.namespaceId,
    params
  ],
  detailKey: (namespaceId: string, identityId: string) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "detail",
    namespaceId,
    identityId
  ],
  search: ({ namespaceId, ...body }: TSearchNamespaceIdentitiesDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.searchKey({ namespaceId, ...body }),
      queryFn: async () => {
        const { data } = await apiRequest.post<{
          identities: TNamespaceIdentityMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceId}/identities/search`, body);
        return data;
      }
    }),
  list: ({ namespaceId, ...params }: TListNamespaceIdentityMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.listKey({ namespaceId, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identityMemberships: TNamespaceIdentityMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceId}/identities`, {
          params
        });
        return data;
      }
    }),
  detail: ({ namespaceId, identityId }: TGetNamespaceIdentityMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.detailKey(namespaceId, identityId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMembership: TNamespaceIdentityMembership }>(
          `/api/v1/namespaces/${namespaceId}/identities/${identityId}`
        );
        return data.identityMembership;
      }
    })
};
