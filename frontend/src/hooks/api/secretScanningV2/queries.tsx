import { keepPreviousData, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetSecretScanningConfigResponse,
  TGetSecretScanningDataSource,
  TGetSecretScanningUnresolvedFindingsResponse,
  TListSecretScanningAvailableResourcesResponse,
  TListSecretScanningBasicDataSources,
  TListSecretScanningBasicResourcesResponse,
  TListSecretScanningDataSourceOptions,
  TListSecretScanningDataSources,
  TListSecretScanningFindingsDTO,
  TListSecretScanningFindingsResponse,
  TListSecretScanningResourcesDTO,
  TListSecretScanningResourcesResponse,
  TListSecretScanningScansResponse,
  TSecretScanningAvailableResource,
  TSecretScanningConfig,
  TSecretScanningDataSource,
  TSecretScanningDataSourceOption,
  TSecretScanningDataSourceResponse,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningResource,
  TSecretScanningScanWithDetails
} from "./types";

// Resolves the org's active Secret Scanning project, creating it on first access (lazy bootstrap on the backend).
export const fetchSecretScanningProjectId = async () => {
  const { data } = await apiRequest.get<{ projectId: string }>("/api/v2/secret-scanning/project");
  return data.projectId;
};

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
  // nested under the dashboard keys so every invalidation of those lists refreshes these too
  listBasicDataSources: (projectId: string) => [
    ...secretScanningV2Keys.listDataSources(projectId),
    "basic"
  ],
  listBasicResources: (dataSourceId: string) => [
    ...secretScanningV2Keys.listResources(dataSourceId),
    "basic"
  ],
  listAvailableResources: (dataSourceId: string) => [
    ...secretScanningV2Keys.listResources(dataSourceId),
    "available"
  ],
  listResources: (dataSourceId: string) => [
    ...secretScanningV2Keys.dataSource(),
    "resources",
    dataSourceId
  ],
  listResourcesWithParams: ({ dataSourceId, ...params }: TListSecretScanningResourcesDTO) => [
    ...secretScanningV2Keys.listResources(dataSourceId),
    "dashboard",
    params
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
  listFindingsWithParams: (params: TListSecretScanningFindingsDTO) => [
    ...secretScanningV2Keys.listFindings(params.projectId),
    params
  ],
  configByProjectId: (projectId: string) =>
    [...secretScanningV2Keys.all, "config", projectId] as const,
  activeProjectId: (orgId: string) => [...secretScanningV2Keys.all, "project", orgId] as const,
  instanceState: (orgId: string) => [...secretScanningV2Keys.all, "instance", orgId] as const
};

export type TSecretScanningInstanceProject = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type TSecretScanningInstanceState = {
  activeProjectId: string | null;
  projects: TSecretScanningInstanceProject[];
  isMultiInstance: boolean;
};

export const useGetSecretScanningInstanceState = (
  orgId: string,
  { enabled = true }: { enabled?: boolean } = {}
) =>
  useQuery({
    queryKey: secretScanningV2Keys.instanceState(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSecretScanningInstanceState>(
        "/api/v2/secret-scanning/instance"
      );
      return data;
    },
    enabled: Boolean(orgId) && enabled
  });

export const useGetSecretScanningProjectId = (
  orgId: string,
  { enabled = true }: { enabled?: boolean } = {}
) =>
  useQuery({
    queryKey: secretScanningV2Keys.activeProjectId(orgId),
    queryFn: fetchSecretScanningProjectId,
    enabled: Boolean(orgId) && enabled
  });

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

// Unlike the dashboard lists, these include sources and resources whose findings are all closed.
export const useListSecretScanningBasicDataSources = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningDataSource[],
      unknown,
      TSecretScanningDataSource[],
      ReturnType<typeof secretScanningV2Keys.listBasicDataSources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listBasicDataSources(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningBasicDataSources>(
        "/api/v2/secret-scanning/data-sources",
        { params: { projectId } }
      );

      return data.dataSources;
    },
    ...options
  });
};

export const useListSecretScanningBasicResources = (
  { dataSourceId, type }: TGetSecretScanningDataSource,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningResource[],
      unknown,
      TSecretScanningResource[],
      ReturnType<typeof secretScanningV2Keys.listBasicResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listBasicResources(dataSourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningBasicResourcesResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}/resources`
      );

      return data.resources;
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
  params: TListSecretScanningResourcesDTO,
  options?: Omit<
    UseQueryOptions<
      TListSecretScanningResourcesResponse,
      unknown,
      TListSecretScanningResourcesResponse,
      ReturnType<typeof secretScanningV2Keys.listResourcesWithParams>
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { dataSourceId, type, ...query } = params;

  return useQuery({
    queryKey: secretScanningV2Keys.listResourcesWithParams(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningResourcesResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}/resources-dashboard`,
        { params: query }
      );

      return data;
    },
    placeholderData: keepPreviousData,
    ...options
  });
};

export const useListSecretScanningAvailableResources = (
  { dataSourceId, type }: TGetSecretScanningDataSource,
  options?: Omit<
    UseQueryOptions<
      TSecretScanningAvailableResource[],
      unknown,
      TSecretScanningAvailableResource[],
      ReturnType<typeof secretScanningV2Keys.listAvailableResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listAvailableResources(dataSourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningAvailableResourcesResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}/available-resources`
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
  params: TListSecretScanningFindingsDTO,
  options?: Omit<
    UseQueryOptions<
      TListSecretScanningFindingsResponse,
      unknown,
      TListSecretScanningFindingsResponse,
      ReturnType<typeof secretScanningV2Keys.listFindingsWithParams>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.listFindingsWithParams(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningFindingsResponse>(
        "/api/v2/secret-scanning/findings",
        { params }
      );

      return data;
    },
    placeholderData: keepPreviousData,
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
