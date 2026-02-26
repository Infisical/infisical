import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TInfraFile, TInfraGraph, TInfraResource, TInfraRun, TInfraVariable } from "./types";

export const infraKeys = {
  files: (projectId: string) => [{ projectId }, "infra-files"] as const,
  runs: (projectId: string) => [{ projectId }, "infra-runs"] as const,
  run: (runId: string) => [{ runId }, "infra-run"] as const,
  resources: (projectId: string) => [{ projectId }, "infra-resources"] as const,
  graph: (projectId: string) => [{ projectId }, "infra-graph"] as const,
  variables: (projectId: string) => [{ projectId }, "infra-variables"] as const,
  state: (projectId: string) => [{ projectId }, "infra-state"] as const,
  stateHistory: (projectId: string) => [{ projectId }, "infra-state-history"] as const
};

const fetchInfraFiles = async (projectId: string) => {
  const { data } = await apiRequest.get<{ files: TInfraFile[] }>(
    `/api/v1/infra/${projectId}/files`
  );
  return data.files;
};

const fetchInfraRuns = async (projectId: string) => {
  const { data } = await apiRequest.get<{ runs: TInfraRun[] }>(`/api/v1/infra/${projectId}/runs`);
  return data.runs;
};

export const useInfraFiles = (
  projectId: string,
  options?: Omit<UseQueryOptions<TInfraFile[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.files(projectId),
    queryFn: () => fetchInfraFiles(projectId),
    enabled: Boolean(projectId),
    ...options
  });

export const useInfraRuns = (
  projectId: string,
  options?: Omit<UseQueryOptions<TInfraRun[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.runs(projectId),
    queryFn: () => fetchInfraRuns(projectId),
    enabled: Boolean(projectId),
    ...options
  });

export type TInfraRunDetail = TInfraRun & {
  previousFileSnapshot: Record<string, string> | null;
};

const fetchInfraRun = async (projectId: string, runId: string) => {
  const { data } = await apiRequest.get<{
    run: TInfraRun;
    previousFileSnapshot: Record<string, string> | null;
  }>(`/api/v1/infra/${projectId}/runs/${runId}`);
  return { ...data.run, previousFileSnapshot: data.previousFileSnapshot };
};

export const useInfraRun = (
  projectId: string,
  runId: string,
  options?: Omit<UseQueryOptions<TInfraRunDetail>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.run(runId),
    queryFn: () => fetchInfraRun(projectId, runId),
    enabled: Boolean(projectId) && Boolean(runId),
    ...options
  });

const fetchInfraResources = async (projectId: string) => {
  const { data } = await apiRequest.get<{ resources: TInfraResource[] }>(
    `/api/v1/infra/${projectId}/resources`
  );
  return data.resources;
};

export const useInfraResources = (
  projectId: string,
  options?: Omit<UseQueryOptions<TInfraResource[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.resources(projectId),
    queryFn: () => fetchInfraResources(projectId),
    enabled: Boolean(projectId),
    ...options
  });

const fetchInfraGraph = async (projectId: string) => {
  const { data } = await apiRequest.get<TInfraGraph>(`/api/v1/infra/${projectId}/graph`);
  return data;
};

export const useInfraGraph = (
  projectId: string,
  options?: Omit<UseQueryOptions<TInfraGraph>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.graph(projectId),
    queryFn: () => fetchInfraGraph(projectId),
    enabled: Boolean(projectId),
    ...options
  });

const fetchInfraVariables = async (projectId: string) => {
  const { data } = await apiRequest.get<{ variables: TInfraVariable[] }>(
    `/api/v1/infra/${projectId}/variables`
  );
  return data.variables;
};

export const useInfraVariables = (
  projectId: string,
  options?: Omit<UseQueryOptions<TInfraVariable[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.variables(projectId),
    queryFn: () => fetchInfraVariables(projectId),
    enabled: Boolean(projectId),
    ...options
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchInfraState = async (projectId: string): Promise<Record<string, any> | null> => {
  try {
    const { data } = await apiRequest.get(`/api/v1/infra/${projectId}/state`);
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useInfraState = (
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: Omit<UseQueryOptions<Record<string, any> | null>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.state(projectId),
    queryFn: () => fetchInfraState(projectId),
    enabled: Boolean(projectId),
    ...options
  });

const fetchInfraStateHistory = async (projectId: string) => {
  const { data } = await apiRequest.get<{ runs: TInfraRun[] }>(
    `/api/v1/infra/${projectId}/state/history`
  );
  return data.runs;
};

export const useInfraStateHistory = (
  projectId: string,
  options?: Omit<UseQueryOptions<TInfraRun[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: infraKeys.stateHistory(projectId),
    queryFn: () => fetchInfraStateHistory(projectId),
    enabled: Boolean(projectId),
    ...options
  });
