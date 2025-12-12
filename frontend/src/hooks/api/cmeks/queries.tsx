import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  CmekOrderBy,
  TListCmekVersionsResponse,
  TListProjectCmeksDTO,
  TProjectCmeksList,
  TScheduledRotation
} from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

export const cmekKeys = {
  all: ["cmek"] as const,
  lists: () => [...cmekKeys.all, "list"] as const,
  getCmeksByProjectId: ({ projectId, ...filters }: TListProjectCmeksDTO) =>
    [...cmekKeys.lists(), projectId, filters] as const,
  getVersions: (keyId: string) => [...cmekKeys.all, "versions", keyId] as const,
  getScheduledRotation: (keyId: string) => [...cmekKeys.all, "scheduled-rotation", keyId] as const
};

export const useGetCmeksByProjectId = (
  {
    projectId,
    offset = 0,
    limit = 100,
    orderBy = CmekOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = ""
  }: TListProjectCmeksDTO,
  options?: Omit<
    UseQueryOptions<
      TProjectCmeksList,
      unknown,
      TProjectCmeksList,
      ReturnType<typeof cmekKeys.getCmeksByProjectId>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cmekKeys.getCmeksByProjectId({
      projectId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectCmeksList>("/api/v1/kms/keys", {
        params: { projectId, offset, limit, search, orderBy, orderDirection }
      });

      return data;
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    placeholderData: (previousData) => previousData,
    ...options
  });
};

export const useGetCmekVersions = (
  keyId: string,
  options?: Omit<
    UseQueryOptions<
      TListCmekVersionsResponse,
      unknown,
      TListCmekVersionsResponse,
      ReturnType<typeof cmekKeys.getVersions>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cmekKeys.getVersions(keyId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListCmekVersionsResponse>(
        `/api/v1/kms/keys/${keyId}/versions`
      );

      return data;
    },
    enabled: Boolean(keyId) && (options?.enabled ?? true),
    ...options
  });
};

export const useGetCmekScheduledRotation = (
  keyId: string,
  options?: Omit<
    UseQueryOptions<
      TScheduledRotation,
      unknown,
      TScheduledRotation,
      ReturnType<typeof cmekKeys.getScheduledRotation>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cmekKeys.getScheduledRotation(keyId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TScheduledRotation>(
        `/api/v1/kms/keys/${keyId}/scheduled-rotation`
      );

      return data;
    },
    enabled: Boolean(keyId) && (options?.enabled ?? true),
    ...options
  });
};
