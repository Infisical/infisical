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
    username
  }: {
    slug: string;
    offset: number;
    limit: number;
    username: string;
  }) => [...groupKeys.forGroupUserMemberships(slug), { offset, limit, username }] as const
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
  username
}: {
  id: string;
  groupSlug: string;
  offset: number;
  limit: number;
  username: string;
}) => {
  return useQuery({
    queryKey: groupKeys.specificGroupUserMemberships({
      slug: groupSlug,
      offset,
      limit,
      username
    }),
    enabled: Boolean(groupSlug),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        username
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
