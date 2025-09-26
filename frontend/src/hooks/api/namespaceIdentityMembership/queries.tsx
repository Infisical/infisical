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
    params.namespaceName,
    params
  ],
  detailKey: (namespaceName: string, identityId: string) => [
    ...namespaceIdentityMembershipQueryKeys.allKey(),
    "detail",
    namespaceName,
    identityId
  ],
  list: ({ namespaceName, ...params }: TListNamespaceIdentityMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceName, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identityMemberships: TNamespaceIdentityMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceName}/identity-memberships`, {
          params
        });
        return data;
      }
    }),
  detail: ({ namespaceName, identityId }: TGetNamespaceIdentityMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceIdentityMembershipQueryKeys.detailKey(namespaceName, identityId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identityMembership: TNamespaceIdentityMembership }>(
          `/api/v1/namespaces/${namespaceName}/identity-memberships/${identityId}`
        );
        return data.identityMembership;
      }
    })
};
