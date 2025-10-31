import { queryOptions, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  projectKeys,
  TAvailableProjectIdentities,
  TListAvailableProjectIdentitiesDTO
} from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  IdentityProjectMembership,
  TProjectIdentityMembershipsList
} from "@app/hooks/api/identities/types";
import { ProjectIdentityOrderBy, TListProjectIdentitiesDTO } from "@app/hooks/api/projects/types";

export const projectIdentityMembershipQuery = {
  allKey: () => ["project-identity-memberships"] as const,
  listAvailableKey: (params?: TListAvailableProjectIdentitiesDTO) =>
    [...projectIdentityMembershipQuery.allKey(), "list-available", params] as const,
  listAvailable: (params: TListAvailableProjectIdentitiesDTO) =>
    queryOptions({
      queryKey: projectIdentityMembershipQuery.listAvailableKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identities: TAvailableProjectIdentities;
        }>(`/api/v1/projects/${params.projectId}/available-identities`, {
          params: {
            offset: params.offset,
            limit: params.limit,
            identityName: params.identityName
          }
        });
        return data.identities;
      }
    })
};

// TODO (scott/akhi): move to new projectIdentityMembershipQuery structure

export const useListProjectIdentityMemberships = (
  {
    projectId,
    offset = 0,
    limit = 100,
    orderBy = ProjectIdentityOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = ""
  }: TListProjectIdentitiesDTO,
  options?: Omit<
    UseQueryOptions<
      TProjectIdentityMembershipsList,
      unknown,
      TProjectIdentityMembershipsList,
      ReturnType<typeof projectKeys.getProjectIdentityMembershipsWithParams>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: projectKeys.getProjectIdentityMembershipsWithParams({
      projectId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        orderBy: String(orderBy),
        orderDirection: String(orderDirection),
        search: String(search)
      });

      const { data } = await apiRequest.get<TProjectIdentityMembershipsList>(
        `/api/v1/projects/${projectId}/identity-memberships`,
        { params }
      );
      return data;
    },
    enabled: true,
    ...options
  });
};

export const useGetProjectIdentityMembership = (projectId: string, identityId: string) => {
  return useQuery({
    enabled: Boolean(projectId && identityId),
    queryKey: projectKeys.getProjectIdentityMembershipDetails(projectId, identityId),
    queryFn: async () => {
      const {
        data: { identityMembership }
      } = await apiRequest.get<{ identityMembership: IdentityProjectMembership }>(
        `/api/v1/projects/${projectId}/identity-memberships/${identityId}`
      );
      return identityMembership;
    }
  });
};
