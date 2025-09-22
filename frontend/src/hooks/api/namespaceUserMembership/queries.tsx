import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TNamespaceMembership,
  TListNamespaceMembershipsDTO,
  TGetNamespaceMembershipByIdDTO,
  TSearchNamespaceMembershipsDTO
} from "./types";

export const namespaceUserMembershipQueryKeys = {
  allKey: () => ["namespace-user-membership"],
  listKey: (params: TListNamespaceMembershipsDTO) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "list",
    params.namespaceName,
    params
  ],
  detailKey: (namespaceName: string, membershipId: string) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "detail",
    namespaceName,
    membershipId
  ],
  searchKey: (params: TSearchNamespaceMembershipsDTO) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "search",
    params.namespaceName,
    params
  ],
  list: ({ namespaceName, ...params }: TListNamespaceMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceName, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          members: TNamespaceMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceName}/memberships`, {
          params
        });
        return data;
      }
    }),
  detail: ({ namespaceName, membershipId }: TGetNamespaceMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.detailKey(namespaceName, membershipId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ membership: TNamespaceMembership }>(
          `/api/v1/namespaces/${namespaceName}/memberships/${membershipId}`
        );
        return data.membership;
      }
    }),
  search: ({ namespaceName, ...params }: TSearchNamespaceMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.searchKey({ namespaceName, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          members: TNamespaceMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceName}/memberships/search`, {
          params
        });
        return data;
      }
    })
};
