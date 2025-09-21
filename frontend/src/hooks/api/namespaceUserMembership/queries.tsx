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
    params.namespaceSlug,
    params
  ],
  detailKey: (namespaceSlug: string, membershipId: string) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "detail",
    namespaceSlug,
    membershipId
  ],
  searchKey: (params: TSearchNamespaceMembershipsDTO) => [
    ...namespaceUserMembershipQueryKeys.allKey(),
    "search",
    params.namespaceSlug,
    params
  ],
  list: ({ namespaceSlug, ...params }: TListNamespaceMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceSlug, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ members: TNamespaceMembership[]; totalCount: number }>(
          `/api/v1/namespaces/${namespaceSlug}/memberships`,
          {
            params
          }
        );
        return data;
      }
    }),
  detail: ({ namespaceSlug, membershipId }: TGetNamespaceMembershipByIdDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.detailKey(namespaceSlug, membershipId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ membership: TNamespaceMembership }>(
          `/api/v1/namespaces/${namespaceSlug}/memberships/${membershipId}`
        );
        return data.membership;
      }
    }),
  search: ({ namespaceSlug, ...params }: TSearchNamespaceMembershipsDTO) =>
    queryOptions({
      queryKey: namespaceUserMembershipQueryKeys.searchKey({ namespaceSlug, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ members: TNamespaceMembership[]; totalCount: number }>(
          `/api/v1/namespaces/${namespaceSlug}/memberships/search`,
          {
            params
          }
        );
        return data;
      }
    })
};