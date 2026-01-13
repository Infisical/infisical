import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  CmekOrderBy,
  TCmekGetPrivateKeyResponse,
  TCmekGetPublicKeyResponse,
  TListProjectCmeksDTO,
  TProjectCmeksList
} from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

export const cmekKeys = {
  all: ["cmek"] as const,
  lists: () => [...cmekKeys.all, "list"] as const,
  getCmeksByProjectId: ({ projectId, ...filters }: TListProjectCmeksDTO) =>
    [...cmekKeys.lists(), projectId, filters] as const,
  getPublicKey: (keyId: string) => [...cmekKeys.all, "public-key", keyId] as const,
  getPrivateKey: (keyId: string) => [...cmekKeys.all, "private-key", keyId] as const
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

export const useGetCmekPublicKey = (
  keyId: string,
  options?: Omit<
    UseQueryOptions<
      TCmekGetPublicKeyResponse,
      unknown,
      TCmekGetPublicKeyResponse,
      ReturnType<typeof cmekKeys.getPublicKey>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cmekKeys.getPublicKey(keyId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCmekGetPublicKeyResponse>(
        `/api/v1/kms/keys/${keyId}/public-key`
      );
      return data;
    },
    enabled: Boolean(keyId) && (options?.enabled ?? true),
    ...options
  });
};

export const useGetCmekPrivateKey = (
  keyId: string,
  options?: Omit<
    UseQueryOptions<
      TCmekGetPrivateKeyResponse,
      unknown,
      TCmekGetPrivateKeyResponse,
      ReturnType<typeof cmekKeys.getPrivateKey>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cmekKeys.getPrivateKey(keyId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCmekGetPrivateKeyResponse>(
        `/api/v1/kms/keys/${keyId}/private-key`
      );
      return data;
    },
    enabled: Boolean(keyId) && (options?.enabled ?? true),
    ...options
  });
};
