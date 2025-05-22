import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TListSecretScanningDataSourceOptions,
  TListSecretScanningDataSources,
  TSecretScanningDataSourceOption,
  TSecretScanningDataSourceWithDetails
} from "./types";

export const secretScanningV2Keys = {
  all: ["secret-scanning-v2"] as const,
  dataSource: () => [...secretScanningV2Keys.all, "data-source"] as const,
  dataSourceOptions: () => [...secretScanningV2Keys.dataSource(), "options"] as const,
  listDataSources: (projectId: string) => [...secretScanningV2Keys.dataSource(), "list", projectId]
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
      TSecretScanningDataSourceWithDetails,
      unknown,
      TSecretScanningDataSourceWithDetails,
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
