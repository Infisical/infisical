import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export const groupKeys = {
  allGroupUserMemberships: () => ["group-user-memberships"] as const,
  forGroupUserMemberships: (slug: string) =>
    [...groupKeys.allGroupUserMemberships(), slug] as const,
  specificGroupUserMemberships: ({
    slug,
    offset,
    limit,
    search
  }: {
    slug: string;
    offset: number;
    limit: number;
    search: string;
  }) => [...groupKeys.forGroupUserMemberships(slug), { offset, limit, search }] as const
};

type TUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  isPartOfGroup: boolean;
};

export const useListGroupUsers = ({
  id,
  groupSlug,
  offset = 0,
  limit = 10,
  search
}: {
  id: string;
  groupSlug: string;
  offset: number;
  limit: number;
  search: string;
}) => {
  return useQuery({
    queryKey: groupKeys.specificGroupUserMemberships({
      slug: groupSlug,
      offset,
      limit,
      search
    }),
    enabled: Boolean(groupSlug),
    keepPreviousData: true,
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        search
      });

      const { data } = await apiRequest.get<{ users: TUser[]; totalCount: number }>(
        `/api/v1/groups/${id}/users`,
        {
          params
        }
      );

      return data;
    }
  });
};
