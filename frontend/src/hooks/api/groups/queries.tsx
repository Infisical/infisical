import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { EFilterReturnedUsers, TGroup, TGroupUser } from "./types";

export const groupKeys = {
  getGroupById: (groupId: string) => [{ groupId }, "group"] as const,
  allGroupUserMemberships: () => ["group-user-memberships"] as const,
  forGroupUserMemberships: (slug: string) =>
    [...groupKeys.allGroupUserMemberships(), slug] as const,
  specificGroupUserMemberships: ({
    slug,
    offset,
    limit,
    search,
    filter
  }: {
    slug: string;
    offset: number;
    limit: number;
    search: string;
    filter?: EFilterReturnedUsers;
  }) => [...groupKeys.forGroupUserMemberships(slug), { offset, limit, search, filter }] as const,
  specificProjectGroupUserMemberships: ({
    projectId,
    slug,
    offset,
    limit,
    search,
    filter
  }: {
    slug: string;
    projectId: string;
    offset: number;
    limit: number;
    search: string;
    filter?: EFilterReturnedUsers;
  }) =>
    [
      ...groupKeys.forGroupUserMemberships(slug),
      projectId,
      { offset, limit, search, filter }
    ] as const
};

export const useGetGroupById = (groupId: string) => {
  return useQuery({
    enabled: Boolean(groupId),
    queryKey: groupKeys.getGroupById(groupId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGroup>(`/api/v1/groups/${groupId}`);

      return { group: data };
    }
  });
};

export const useListGroupUsers = ({
  id,
  groupSlug,
  offset = 0,
  limit = 10,
  search,
  filter
}: {
  id: string;
  groupSlug: string;
  offset: number;
  limit: number;
  search: string;
  filter?: EFilterReturnedUsers;
}) => {
  return useQuery({
    queryKey: groupKeys.specificGroupUserMemberships({
      slug: groupSlug,
      offset,
      limit,
      search,
      filter
    }),
    enabled: Boolean(groupSlug),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        search,
        ...(filter && { filter })
      });

      const { data } = await apiRequest.get<{ users: TGroupUser[]; totalCount: number }>(
        `/api/v1/groups/${id}/users`,
        {
          params
        }
      );

      return data;
    }
  });
};

export const useListProjectGroupUsers = ({
  id,
  projectId,
  groupSlug,
  offset = 0,
  limit = 10,
  search,
  filter
}: {
  id: string;
  groupSlug: string;
  projectId: string;
  offset: number;
  limit: number;
  search: string;
  filter?: EFilterReturnedUsers;
}) => {
  return useQuery({
    queryKey: groupKeys.specificProjectGroupUserMemberships({
      slug: groupSlug,
      projectId,
      offset,
      limit,
      search,
      filter
    }),
    enabled: Boolean(groupSlug),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        search,
        ...(filter && { filter })
      });

      const { data } = await apiRequest.get<{ users: TGroupUser[]; totalCount: number }>(
        `/api/v2/workspace/${projectId}/groups/${id}/users`,
        {
          params
        }
      );

      return data;
    }
  });
};
