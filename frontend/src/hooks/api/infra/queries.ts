import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TInfraFile, TInfraResource, TInfraRun } from "./types";

export const infraKeys = {
  files: (projectId: string) => [{ projectId }, "infra-files"] as const,
  runs: (projectId: string) => [{ projectId }, "infra-runs"] as const,
  run: (runId: string) => [{ runId }, "infra-run"] as const,
  resources: (projectId: string) => [{ projectId }, "infra-resources"] as const
};

const fetchInfraFiles = async (projectId: string) => {
  const { data } = await apiRequest.get<{ files: TInfraFile[] }>(`/api/v1/infra/${projectId}/files`);
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
  const { data } = await apiRequest.get<{ run: TInfraRun; previousFileSnapshot: Record<string, string> | null }>(
    `/api/v1/infra/${projectId}/runs/${runId}`
  );
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
