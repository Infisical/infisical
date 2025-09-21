import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TNamespaceIdentityMembership,
  TListNamespaceIdentityMembershipsDTO,
  TGetNamespaceIdentityMembershipByIdDTO
} from "./types";

export const namespaceIdentityMembershipQueryKeys = {
  allKey: () => ["namespace-identity-membership"],
  listKey: (params: TListNamespaceIdentityMembershipsDTO) => [
    ...namespaceIdentityMembershipQueryKeys.allKey(),
    "list",
    params.namespaceSlug,
    params
  ],
  detailKey: (namespaceSlug: string, identityId: string) => [
    ...namespaceIdentityMembershipQueryKeys.allKey(),
    "detail",
    namespaceSlug,
    identityId
  ],
  list: ({ namespaceSlug, ...params }: TListNamespaceIdentityMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceSlug, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMemberships: TNamespaceIdentityMembership[]; totalCount: number }>(
          `/api/v1/namespaces/${namespaceSlug}/identity-memberships`,
          {
            params
          }
        );
        return data;
      }
    }),
  detail: ({ namespaceSlug, identityId }: TGetNamespaceIdentityMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceIdentityMembershipQueryKeys.detailKey(namespaceSlug, identityId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMembership: TNamespaceIdentityMembership }>(
          `/api/v1/namespaces/${namespaceSlug}/identity-memberships/${identityId}`
        );
        return data.identityMembership;
      }
    })
};