import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TNamespaceIdentityMembership,
  TSearchNamespaceIdentitiesDTO,
  TListNamespaceIdentityMembershipsDTO,
  TGetNamespaceIdentityMembershipByIdDTO
} from "./types";

export const namespaceIdentityQueryKeys = {
  allKey: () => ["namespace-identity"],
  searchKey: (params: TSearchNamespaceIdentitiesDTO) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "search",
    params.namespaceSlug,
    params
  ],
  listKey: (params: TListNamespaceIdentityMembershipsDTO) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "list",
    params.namespaceSlug,
    params
  ],
  detailKey: (namespaceSlug: string, identityId: string) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "detail",
    namespaceSlug,
    identityId
  ],
  search: ({ namespaceSlug, ...body }: TSearchNamespaceIdentitiesDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.searchKey({ namespaceSlug, ...body }),
      queryFn: async () => {
        const { data } = await apiRequest.post<{ identities: TNamespaceIdentityMembership[]; totalCount: number }>(
          `/api/v1/namespaces/${namespaceSlug}/identities/search`,
          body
        );
        return data;
      }
    }),
  list: ({ namespaceSlug, ...params }: TListNamespaceIdentityMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.listKey({ namespaceSlug, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMemberships: TNamespaceIdentityMembership[]; totalCount: number }>(
          `/api/v1/namespaces/${namespaceSlug}/identities`,
          {
            params
          }
        );
        return data;
      }
    }),
  detail: ({ namespaceSlug, identityId }: TGetNamespaceIdentityMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.detailKey(namespaceSlug, identityId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMembership: TNamespaceIdentityMembership }>(
          `/api/v1/namespaces/${namespaceSlug}/identities/${identityId}`
        );
        return data.identityMembership;
      }
    })
};