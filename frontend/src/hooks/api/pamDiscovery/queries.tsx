import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  PamDiscoveryType,
  TDiscoveredAccount,
  TDiscoveredResource,
  TListPamDiscoverySourcesDTO,
  TPamDiscoveryRun,
  TPamDiscoverySource,
  TPamDiscoverySourceOption
} from "./types";

export const pamDiscoveryKeys = {
  all: ["pam-discovery"] as const,
  options: () => [...pamDiscoveryKeys.all, "options"] as const,
  sources: () => [...pamDiscoveryKeys.all, "sources"] as const,
  listSources: (params: TListPamDiscoverySourcesDTO) =>
    [...pamDiscoveryKeys.sources(), "list", params] as const,
  getSource: (discoverySourceId: string) =>
    [...pamDiscoveryKeys.sources(), "get", discoverySourceId] as const,
  runs: (discoverySourceId: string) =>
    [...pamDiscoveryKeys.all, "runs", discoverySourceId] as const,
  listRuns: (discoverySourceId: string, params: { offset?: number; limit?: number }) =>
    [...pamDiscoveryKeys.runs(discoverySourceId), "list", params] as const,
  getRun: (discoverySourceId: string, runId: string) =>
    [...pamDiscoveryKeys.runs(discoverySourceId), "get", runId] as const,
  discoveredResources: (discoverySourceId: string, params: { offset?: number; limit?: number }) =>
    [...pamDiscoveryKeys.all, "discovered-resources", discoverySourceId, params] as const,
  discoveredAccounts: (discoverySourceId: string, params: { offset?: number; limit?: number }) =>
    [...pamDiscoveryKeys.all, "discovered-accounts", discoverySourceId, params] as const
};

export const useListPamDiscoverySourceOptions = (
  options?: Omit<
    UseQueryOptions<
      TPamDiscoverySourceOption[],
      unknown,
      TPamDiscoverySourceOption[],
      ReturnType<typeof pamDiscoveryKeys.options>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamDiscoveryKeys.options(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ discoveryOptions: TPamDiscoverySourceOption[] }>(
        "/api/v1/pam/discovery/options"
      );
      return data.discoveryOptions;
    },
    ...options
  });
};

type TListSourcesResponse = { sources: TPamDiscoverySource[]; totalCount: number };

export const useListPamDiscoverySources = (
  params: TListPamDiscoverySourcesDTO,
  options?: Omit<
    UseQueryOptions<
      TListSourcesResponse,
      unknown,
      TListSourcesResponse,
      ReturnType<typeof pamDiscoveryKeys.listSources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamDiscoveryKeys.listSources(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSourcesResponse>("/api/v1/pam/discovery", {
        params
      });
      return data;
    },
    placeholderData: (prev) => prev,
    ...options
  });
};

export const useGetPamDiscoverySource = (
  discoverySourceId: string,
  discoveryType: PamDiscoveryType,
  options?: Omit<
    UseQueryOptions<
      TPamDiscoverySource,
      unknown,
      TPamDiscoverySource,
      ReturnType<typeof pamDiscoveryKeys.getSource>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamDiscoveryKeys.getSource(discoverySourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ source: TPamDiscoverySource }>(
        `/api/v1/pam/discovery/${discoveryType}/${discoverySourceId}`
      );
      return data.source;
    },
    enabled: !!discoverySourceId && !!discoveryType && (options?.enabled ?? true),
    ...options
  });
};

type TListRunsResponse = { runs: TPamDiscoveryRun[]; totalCount: number };

export const useListPamDiscoveryRuns = (
  discoverySourceId: string,
  discoveryType: PamDiscoveryType,
  params: { offset?: number; limit?: number },
  options?: Omit<
    UseQueryOptions<
      TListRunsResponse,
      unknown,
      TListRunsResponse,
      ReturnType<typeof pamDiscoveryKeys.listRuns>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamDiscoveryKeys.listRuns(discoverySourceId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListRunsResponse>(
        `/api/v1/pam/discovery/${discoveryType}/${discoverySourceId}/runs`,
        { params }
      );
      return data;
    },
    enabled: !!discoverySourceId && !!discoveryType && (options?.enabled ?? true),
    placeholderData: (prev) => prev,
    ...options
  });
};

type TListDiscoveredResourcesResponse = { resources: TDiscoveredResource[]; totalCount: number };

export const useGetDiscoveredResources = (
  discoverySourceId: string,
  discoveryType: PamDiscoveryType,
  params: { offset?: number; limit?: number },
  options?: Omit<
    UseQueryOptions<
      TListDiscoveredResourcesResponse,
      unknown,
      TListDiscoveredResourcesResponse,
      ReturnType<typeof pamDiscoveryKeys.discoveredResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamDiscoveryKeys.discoveredResources(discoverySourceId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListDiscoveredResourcesResponse>(
        `/api/v1/pam/discovery/${discoveryType}/${discoverySourceId}/resources`,
        { params }
      );
      return data;
    },
    enabled: !!discoverySourceId && !!discoveryType && (options?.enabled ?? true),
    placeholderData: (prev) => prev,
    ...options
  });
};

type TListDiscoveredAccountsResponse = { accounts: TDiscoveredAccount[]; totalCount: number };

export const useGetDiscoveredAccounts = (
  discoverySourceId: string,
  discoveryType: PamDiscoveryType,
  params: { offset?: number; limit?: number },
  options?: Omit<
    UseQueryOptions<
      TListDiscoveredAccountsResponse,
      unknown,
      TListDiscoveredAccountsResponse,
      ReturnType<typeof pamDiscoveryKeys.discoveredAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamDiscoveryKeys.discoveredAccounts(discoverySourceId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListDiscoveredAccountsResponse>(
        `/api/v1/pam/discovery/${discoveryType}/${discoverySourceId}/accounts`,
        { params }
      );
      return data;
    },
    enabled: !!discoverySourceId && !!discoveryType && (options?.enabled ?? true),
    placeholderData: (prev) => prev,
    ...options
  });
};
