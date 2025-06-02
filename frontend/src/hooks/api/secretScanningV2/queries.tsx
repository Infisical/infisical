import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetSecretScanningConfigResponse,
  TGetSecretScanningDataSource,
  TGetSecretScanningUnresolvedFindingsResponse,
  TListSecretScanningDataSourceOptions,
  TListSecretScanningDataSources,
  TListSecretScanningFindingsResponse,
  TListSecretScanningResourcesResponse,
  TListSecretScanningScansResponse,
  TSecretScanningConfig,
  TSecretScanningDataSource,
  TSecretScanningDataSourceOption,
  TSecretScanningDataSourceResponse,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningFinding,
  TSecretScanningResourceWithDetails,
  TSecretScanningScanWithDetails
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
  ],
  listScans: (dataSourceId: string) => [
    ...secretScanningV2Keys.dataSource(),
    "scans",
    dataSourceId
  ],
  finding: () => [...secretScanningV2Keys.all, "finding"] as const,
  findingCount: (projectId: string) =>
    [...secretScanningV2Keys.finding(), "count", projectId] as const,
  listFindings: (projectId: string) => [...secretScanningV2Keys.finding(), "list", projectId],
  configByProjectId: (projectId: string) =>
    [...secretScanningV2Keys.all, "config", projectId] as const
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
        "/api/v2/secret-scanning/data-sources-dashboard",
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
      TSecretScanningResourceWithDetails[],
      unknown,
      TSecretScanningResourceWithDetails[],
      ReturnType<typeof secretScanningV2Keys.listResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listResources(dataSourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningResourcesResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}/resources-dashboard`
      );

      return data.resources;
    },
    ...options
  });
};

export const useListSecretScanningScans = (
  { dataSourceId, type }: TGetSecretScanningDataSource,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningScanWithDetails[],
      unknown,
      TSecretScanningScanWithDetails[],
      ReturnType<typeof secretScanningV2Keys.listScans>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listScans(dataSourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningScansResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}/scans-dashboard`
      );

      return data.scans;
    },
    ...options
  });
};

export const useGetSecretScanningUnresolvedFindingCount = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<number, unknown, number, ReturnType<typeof secretScanningV2Keys.findingCount>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.findingCount(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetSecretScanningUnresolvedFindingsResponse>(
        "/api/v2/secret-scanning/unresolved-findings-count",
        { params: { projectId } }
      );

      return data.unresolvedFindings;
    },
    ...options
  });
};

export const useListSecretScanningFindings = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningFinding[],
      unknown,
      TSecretScanningFinding[],
      ReturnType<typeof secretScanningV2Keys.listFindings>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listFindings(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningFindingsResponse>(
        "/api/v2/secret-scanning/findings",
        { params: { projectId } }
      );

      return data.findings;
    },
    ...options
  });
};

export const useGetSecretScanningConfig = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningConfig,
      unknown,
      TSecretScanningConfig,
      ReturnType<typeof secretScanningV2Keys.configByProjectId>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.configByProjectId(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetSecretScanningConfigResponse>(
        "/api/v2/secret-scanning/configs",
        { params: { projectId } }
      );

      return data.config;
    },
    ...options
  });
};
