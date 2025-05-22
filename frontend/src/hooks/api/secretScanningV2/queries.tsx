import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetSecretScanningDataSource,
  TListSecretScanningDataSourceOptions,
  TListSecretScanningDataSources,
  TListSecretScanningResourcesResponse,
  TSecretScanningDataSource,
  TSecretScanningDataSourceOption,
  TSecretScanningDataSourceResponse,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningResource
} from "./types";

export const secretScanningV2Keys = {
  all: ["secret-scanning-v2"] as const,
  dataSource: () => [...secretScanningV2Keys.all, "data-source"] as const,
  dataSourceOptions: () => [...secretScanningV2Keys.dataSource(), "options"] as const,
  dataSourceById: (dataSourceId: string) => [
    ...secretScanningV2Keys.dataSource(),
    "byId",
    dataSourceId
  ],
  listDataSources: (projectId: string) => [...secretScanningV2Keys.dataSource(), "list", projectId],
  listResources: (dataSourceId: string) => [
    ...secretScanningV2Keys.dataSource(),
    "resources",
    dataSourceId
  ]
};

export const useSecretScanningDataSourceOptions = (
  options?: Omit<
    UseQueryOptions<
      TSecretScanningDataSourceOption[],
      unknown,
      TSecretScanningDataSourceOption[],
      ReturnType<typeof secretScanningV2Keys.dataSourceOptions>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.dataSourceOptions(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningDataSourceOptions>(
        "/api/v2/secret-scanning/data-sources/options"
      );

      return data.dataSourceOptions;
    },
    ...options
  });
};

export const useListSecretScanningDataSources = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningDataSourceWithDetails[],
      unknown,
      TSecretScanningDataSourceWithDetails[],
      ReturnType<typeof secretScanningV2Keys.listDataSources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listDataSources(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningDataSources>(
        "/api/v2/secret-scanning/data-sources/details",
        { params: { projectId } }
      );

      return data.dataSources;
    },
    ...options
  });
};

export const useGetSecretScanningDataSource = (
  { dataSourceId, type }: TGetSecretScanningDataSource,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningDataSource,
      unknown,
      TSecretScanningDataSource,
      ReturnType<typeof secretScanningV2Keys.dataSourceById>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.dataSourceById(dataSourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSecretScanningDataSourceResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}`
      );

      return data.dataSource;
    },
    ...options
  });
};

export const useListSecretScanningResources = (
  { dataSourceId, type }: TGetSecretScanningDataSource,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningResource[],
      unknown,
      TSecretScanningResource[],
      ReturnType<typeof secretScanningV2Keys.listResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listResources(dataSourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningResourcesResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}/resources`
      );

      return data.resources;
    },
    ...options
  });
};
