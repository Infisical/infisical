import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { EFilterReturnedIdentities, TIdentityGroup, TIdentityGroupIdentity } from "./types";

export const identityGroupKeys = {
  getIdentityGroupById: (identityGroupId: string) =>
    [{ identityGroupId }, "identity-group"] as const,
  allIdentityGroupIdentityMemberships: () => ["identity-group-identity-memberships"] as const,
  forIdentityGroupIdentityMemberships: (slug: string) =>
    [...identityGroupKeys.allIdentityGroupIdentityMemberships(), slug] as const,
  specificIdentityGroupIdentityMemberships: ({
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
    filter?: EFilterReturnedIdentities;
  }) =>
    [
      ...identityGroupKeys.forIdentityGroupIdentityMemberships(slug),
      { offset, limit, search, filter }
    ] as const,
  specificProjectIdentityGroupIdentityMemberships: ({
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
    filter?: EFilterReturnedIdentities;
  }) =>
    [
      ...identityGroupKeys.forIdentityGroupIdentityMemberships(slug),
      projectId,
      { offset, limit, search, filter }
    ] as const
};

export const useGetIdentityGroupById = (identityGroupId: string) => {
  return useQuery({
    enabled: Boolean(identityGroupId),
    queryKey: identityGroupKeys.getIdentityGroupById(identityGroupId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TIdentityGroup>(
        `/api/v1/identity-groups/${identityGroupId}`
      );

      return { identityGroup: data };
    }
  });
};

export const useListIdentityGroupIdentities = ({
  id,
  identityGroupSlug,
  offset = 0,
  limit = 10,
  search,
  filter
}: {
  id: string;
  identityGroupSlug: string;
  offset: number;
  limit: number;
  search: string;
  filter?: EFilterReturnedIdentities;
}) => {
  return useQuery({
    queryKey: identityGroupKeys.specificIdentityGroupIdentityMemberships({
      slug: identityGroupSlug,
      offset,
      limit,
      search,
      filter
    }),
    enabled: Boolean(identityGroupSlug),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        search,
        ...(filter && { filter })
      });

      const { data } = await apiRequest.get<{
        identities: TIdentityGroupIdentity[];
        totalCount: number;
      }>(`/api/v1/identity-groups/${id}/identities`, {
        params
      });

      return data;
    }
  });
};

export const useListProjectIdentityGroupIdentities = ({
  id,
  projectId,
  identityGroupSlug,
  offset = 0,
  limit = 10,
  search,
  filter
}: {
  id: string;
  identityGroupSlug: string;
  projectId: string;
  offset: number;
  limit: number;
  search: string;
  filter?: EFilterReturnedIdentities;
}) => {
  return useQuery({
    queryKey: identityGroupKeys.specificProjectIdentityGroupIdentityMemberships({
      slug: identityGroupSlug,
      projectId,
      offset,
      limit,
      search,
      filter
    }),
    enabled: Boolean(identityGroupSlug),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        search,
        ...(filter && { filter })
      });

      const { data } = await apiRequest.get<{
        identities: TIdentityGroupIdentity[];
        totalCount: number;
      }>(`/api/v2/workspace/${projectId}/identity-groups/${id}/identities`, {
        params
      });

      return data;
    }
  });
};
