import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetNamespaceIdentityMembershipByIdDTO,
  TListNamespaceIdentityMembershipsDTO,
  TNamespaceIdentityMembership
} from "./types";

export const namespaceIdentityMembershipQueryKeys = {
  allKey: () => ["namespace-identity-membership"],
  listKey: (params: TListNamespaceIdentityMembershipsDTO) => [
    ...namespaceIdentityMembershipQueryKeys.allKey(),
    "list",
    params.namespaceId,
    params
  ],
  detailKey: (namespaceId: string, identityId: string) => [
    ...namespaceIdentityMembershipQueryKeys.allKey(),
    "detail",
    namespaceId,
    identityId
  ],
  list: ({ namespaceId, ...params }: TListNamespaceIdentityMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceId, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identityMemberships: TNamespaceIdentityMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceId}/identity-memberships`, {
          params
        });
        return data;
      }
    }),
  detail: ({ namespaceId, identityId }: TGetNamespaceIdentityMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceIdentityMembershipQueryKeys.detailKey(namespaceId, identityId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMembership: TNamespaceIdentityMembership }>(
          `/api/v1/namespaces/${namespaceId}/identity-memberships/${identityId}`
        );
        return data.identityMembership;
      }
    })
};
