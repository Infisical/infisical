import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { OrderByDirection } from "../generic/types";
import {
  FilterMemberType,
  FilterReturnedIdentities,
  FilterReturnedProjects,
  FilterReturnedUsers,
  GroupMembersOrderBy,
  TGroup,
  TGroupIdentity,
  TGroupMember,
  TGroupProject,
  TGroupUser
} from "./types";

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
    filter?: FilterReturnedUsers;
  }) => [...groupKeys.forGroupUserMemberships(slug), { offset, limit, search, filter }] as const,
  allGroupIdentitiesMemberships: () => ["group-identities-memberships"] as const,
  forGroupIdentitiesMemberships: (slug: string) =>
    [...groupKeys.allGroupIdentitiesMemberships(), slug] as const,
  specificGroupIdentitiesMemberships: ({
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
    filter?: FilterReturnedIdentities;
  }) =>
    [...groupKeys.forGroupIdentitiesMemberships(slug), { offset, limit, search, filter }] as const,
  allGroupMembers: () => ["group-members"] as const,
  forGroupMembers: (slug: string) => [...groupKeys.allGroupMembers(), slug] as const,
  specificGroupMembers: ({
    slug,
    offset,
    limit,
    search,
    orderBy,
    orderDirection,
    memberTypeFilter
  }: {
    slug: string;
    offset: number;
    limit: number;
    search: string;
    orderBy?: GroupMembersOrderBy;
    orderDirection?: OrderByDirection;
    memberTypeFilter?: FilterMemberType[];
  }) =>
    [
      ...groupKeys.forGroupMembers(slug),
      { offset, limit, search, orderBy, orderDirection, memberTypeFilter }
    ] as const,
  allGroupProjects: () => ["group-projects"] as const,
  forGroupProjects: (groupId: string) => [...groupKeys.allGroupProjects(), groupId] as const,
  specificGroupProjects: ({
    groupId,
    offset,
    limit,
    search,
    filter,
    orderBy,
    orderDirection
  }: {
    groupId: string;
    offset: number;
    limit: number;
    search: string;
    filter?: FilterReturnedProjects;
    orderBy?: string;
    orderDirection?: OrderByDirection;
  }) =>
    [
      ...groupKeys.forGroupProjects(groupId),
      { offset, limit, search, filter, orderBy, orderDirection }
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
  filter?: FilterReturnedUsers;
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

export const useListGroupMembers = ({
  id,
  groupSlug,
  offset = 0,
  limit = 10,
  search,
  orderBy,
  orderDirection,
  memberTypeFilter
}: {
  id: string;
  groupSlug: string;
  offset: number;
  limit: number;
  search: string;
  orderBy?: GroupMembersOrderBy;
  orderDirection?: OrderByDirection;
  memberTypeFilter?: FilterMemberType[];
}) => {
  return useQuery({
    queryKey: groupKeys.specificGroupMembers({
      slug: groupSlug,
      offset,
      limit,
      search,
      orderBy,
      orderDirection,
      memberTypeFilter
    }),
    enabled: Boolean(groupSlug),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        search,
        ...(orderBy && { orderBy: orderBy.toString() }),
        ...(orderDirection && { orderDirection })
      });

      if (memberTypeFilter && memberTypeFilter.length > 0) {
        memberTypeFilter.forEach((filter) => {
          params.append("memberTypeFilter", filter);
        });
      }

      const { data } = await apiRequest.get<{ members: TGroupMember[]; totalCount: number }>(
        `/api/v1/groups/${id}/members`,
        {
          params
        }
      );

      return data;
    }
  });
};

export const useListGroupIdentities = ({
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
  filter?: FilterReturnedIdentities;
}) => {
  return useQuery({
    queryKey: groupKeys.specificGroupIdentitiesMemberships({
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

      const { data } = await apiRequest.get<{ identities: TGroupIdentity[]; totalCount: number }>(
        `/api/v1/groups/${id}/identities`,
        {
          params
        }
      );

      return data;
    }
  });
};

export const useListGroupProjects = ({
  id,
  offset = 0,
  limit = 10,
  search,
  filter,
  orderBy,
  orderDirection
}: {
  id: string;
  offset: number;
  limit: number;
  search: string;
  orderBy?: string;
  orderDirection?: OrderByDirection;
  filter?: FilterReturnedProjects;
}) => {
  return useQuery({
    queryKey: groupKeys.specificGroupProjects({
      groupId: id,
      offset,
      limit,
      search,
      filter,
      orderBy,
      orderDirection
    }),
    enabled: Boolean(id),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        search,
        ...(filter && { filter }),
        ...(orderBy && { orderBy }),
        ...(orderDirection && { orderDirection })
      });

      const { data } = await apiRequest.get<{ projects: TGroupProject[]; totalCount: number }>(
        `/api/v1/groups/${id}/projects`,
        {
          params
        }
      );

      return data;
    }
  });
};
