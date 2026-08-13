import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TSandbox,
  TSandboxCatalog,
  TSandboxDirListing,
  TSandboxFileContent,
  TSandboxContainerStats,
  TSandboxPamProxy,
  TSandboxProcess
} from "./types";

// Mirrors PAM: the sandbox project is hidden, resolved (and bootstrapped) on first visit so the
// Project and ProjectPermission contexts have something to hang off.
export const fetchSandboxProjectId = async () => {
  const { data } = await apiRequest.get<{ projectId: string }>("/api/v1/sandboxes/project");
  return data.projectId;
};

export const sandboxKeys = {
  all: () => ["sandboxes"] as const,
  catalog: () => [...sandboxKeys.all(), "catalog"] as const,
  list: () => [...sandboxKeys.all(), "list"] as const,
  byId: (sandboxId: string) => [...sandboxKeys.all(), "detail", sandboxId] as const,
  files: (sandboxId: string, path: string) =>
    [...sandboxKeys.all(), "files", sandboxId, path] as const,
  fileContent: (sandboxId: string, path: string) =>
    [...sandboxKeys.all(), "file-content", sandboxId, path] as const,
  runtime: (sandboxId: string) => [...sandboxKeys.all(), "runtime", sandboxId] as const,
  processes: (sandboxId: string) => [...sandboxKeys.all(), "processes", sandboxId] as const
};

export const useListSandboxes = () =>
  useQuery({
    queryKey: sandboxKeys.list(),
    staleTime: 0,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ sandboxes: TSandbox[] }>("/api/v1/sandboxes");
      return data.sandboxes;
    }
  });

export const useGetSandboxById = (sandboxId?: string) =>
  useQuery({
    queryKey: sandboxKeys.byId(sandboxId ?? ""),
    enabled: Boolean(sandboxId),
    // `status` reflects the live runtime, not stored state, so the global 60s staleTime would render
    // a green "Running" badge over a shell that already died with the API process.
    staleTime: 0,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ sandbox: TSandbox }>(
        `/api/v1/sandboxes/${sandboxId}`
      );
      return data.sandbox;
    }
  });

export const useGetSandboxCatalog = () =>
  useQuery({
    queryKey: sandboxKeys.catalog(),
    // The catalog is a static server-side constant.
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await apiRequest.get<TSandboxCatalog>("/api/v1/sandboxes/catalog");
      return data;
    }
  });

export const useListSandboxFiles = (sandboxId: string, path: string, isEnabled: boolean) =>
  useQuery({
    queryKey: sandboxKeys.files(sandboxId, path),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSandboxDirListing>(
        `/api/v1/sandboxes/${sandboxId}/files`,
        { params: { path } }
      );
      return data;
    },
    enabled: isEnabled,
    // The container's filesystem changes under us as the agent works, so this is never fresh.
    staleTime: 0
  });

export const useReadSandboxFile = (sandboxId: string, path: string | null) =>
  useQuery({
    queryKey: sandboxKeys.fileContent(sandboxId, path ?? ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSandboxFileContent>(
        `/api/v1/sandboxes/${sandboxId}/files/content`,
        { params: { path } }
      );
      return data;
    },
    enabled: Boolean(path),
    staleTime: 0
  });

/** The brokered PAM ports the sandbox currently holds, which only exist while it is running. */
export const useGetSandboxRuntime = (sandboxId: string, isEnabled: boolean) =>
  useQuery({
    queryKey: sandboxKeys.runtime(sandboxId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ pamProxies: TSandboxPamProxy[] }>(
        `/api/v1/sandboxes/${sandboxId}/system-prompt`
      );
      return data.pamProxies;
    },
    enabled: isEnabled,
    staleTime: 0
  });

/** Polled rather than streamed: a task manager is a periodic snapshot, not an event feed. */
export const useListSandboxProcesses = (sandboxId: string, isEnabled: boolean) =>
  useQuery({
    queryKey: sandboxKeys.processes(sandboxId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        processes: TSandboxProcess[];
        stats: TSandboxContainerStats | null;
      }>(`/api/v1/sandboxes/${sandboxId}/processes`);
      return data;
    },
    enabled: isEnabled,
    refetchInterval: 3000,
    staleTime: 0
  });
