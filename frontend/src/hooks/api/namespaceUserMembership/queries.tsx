import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetNamespaceMembershipByIdDTO,
  TListNamespaceMembershipsDTO,
  TNamespaceMembership,
  TSearchNamespaceMembershipsDTO
} from "./types";

export const namespaceUserMembershipQueryKeys = {
  allKey: () => ["namespace-user-membership"],
  listKey: (params: TListNamespaceMembershipsDTO) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "list",
    params.namespaceId,
    params
  ],
  detailKey: (namespaceId: string, userId: string) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "detail",
    namespaceId,
    userId
  ],
  searchKey: (params: TSearchNamespaceMembershipsDTO) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "search",
    params.namespaceId,
    params
  ],
  list: ({ namespaceId, ...params }: TListNamespaceMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceId, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          memberships: TNamespaceMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceId}/memberships`, {
          params
        });
        return data;
      }
    }),
  detail: ({ namespaceId, userId }: TGetNamespaceMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.detailKey(namespaceId, userId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ membership: TNamespaceMembership }>(
          `/api/v1/namespaces/${namespaceId}/memberships/${userId}`
        );
        return data.membership;
      }
    }),
  search: ({ namespaceId, ...params }: TSearchNamespaceMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.searchKey({ namespaceId, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          memberships: TNamespaceMembership[];
          totalCount: number;
        }>(`/api/v1/namespaces/${namespaceId}/memberships/search`, {
          params
        });
        return data;
      }
    })
};
