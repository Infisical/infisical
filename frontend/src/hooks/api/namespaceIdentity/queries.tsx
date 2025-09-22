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
    params.namespaceName,
    params
  ],
  listKey: (params: TListNamespaceIdentityMembershipsDTO) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "list",
    params.namespaceName,
    params
  ],
  detailKey: (namespaceName: string, identityId: string) => [
    ...namespaceIdentityQueryKeys.allKey(),
    "detail",
    namespaceName,
    identityId
  ],
  search: ({ namespaceName, ...body }: TSearchNamespaceIdentitiesDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.searchKey({ namespaceName, ...body }),
      queryFn: async () => {
        const { data } = await apiRequest.post<{
          identities: TNamespaceIdentityMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceName}/identities/search`, body);
        return data;
      }
    }),
  list: ({ namespaceName, ...params }: TListNamespaceIdentityMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.listKey({ namespaceName, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identityMemberships: TNamespaceIdentityMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceName}/identities`, {
          params
        });
        return data;
      }
    }),
  detail: ({ namespaceName, identityId }: TGetNamespaceIdentityMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceIdentityQueryKeys.detailKey(namespaceName, identityId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMembership: TNamespaceIdentityMembership }>(
          `/api/v1/namespaces/${namespaceName}/identities/${identityId}`
        );
        return data.identityMembership;
      }
    })
};
