import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetProjectIdentityByIdDTO, TListProjectIdentitiesDTO, TProjectIdentity } from "./types";

export const projectIdentityQuery = {
  allKey: () => ["project-identities"] as const,
  getByIdKey: (params: TGetProjectIdentityByIdDTO) =>
    [...projectIdentityQuery.allKey(), "by-id", params] as const,
  listKey: (params: TListProjectIdentitiesDTO) =>
    [...projectIdentityQuery.allKey(), "list", params] as const,
  getById: (params: TGetProjectIdentityByIdDTO) =>
    queryOptions({
      queryKey: projectIdentityQuery.getByIdKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ identity: TProjectIdentity }>(
          `/api/v1/projects/${params.projectId}/identities/${params.identityId}`
        );
        return data.identity;
      }
    }),
  list: (params: TListProjectIdentitiesDTO) =>
    queryOptions({
      queryKey: projectIdentityQuery.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          identities: TProjectIdentity[];
          totalCount: number;
        }>(`/api/v1/projects/${params.projectId}/identities`, {
          params: {
            offset: params.offset,
            limit: params.limit,
            search: params.search
          }
        });
        return data;
      }
    })
};
