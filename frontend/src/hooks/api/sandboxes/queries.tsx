import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSandbox, TSandboxCatalog, TSandboxMetrics, TSandboxProxyActivity } from "./types";

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
  metrics: (sandboxId: string) => [...sandboxKeys.all(), "metrics", sandboxId] as const,
  proxyActivity: (sandboxId: string) => [...sandboxKeys.all(), "proxy-activity", sandboxId] as const
};

export const useListSandboxes = () =>
  useQuery({
    queryKey: sandboxKeys.list(),
    staleTime: 0,
    // The list carries a live CPU series for the card sparklines, and the sparkline slides one slot
    // per sample, so this has to match the sampler's cadence or the trace drifts against its data.
    refetchInterval: 1000,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ sandboxes: TSandbox[] }>("/api/v1/sandboxes");
      return data.sandboxes;
    }
  });

/**
 * Polled rather than streamed: the sampler on the API writes every 3s, so a matching poll keeps the
 * charts moving without a second SSE connection open per open dashboard.
 */
export const useGetSandboxMetrics = (sandboxId?: string, isEnabled = true) =>
  useQuery({
    queryKey: sandboxKeys.metrics(sandboxId ?? ""),
    enabled: Boolean(sandboxId) && isEnabled,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 1000,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ metrics: TSandboxMetrics | null }>(
        `/api/v1/sandboxes/${sandboxId}/metrics`
      );
      return data.metrics;
    }
  });

export const useGetSandboxProxyActivity = (sandboxId?: string, isEnabled = true) =>
  useQuery({
    queryKey: sandboxKeys.proxyActivity(sandboxId ?? ""),
    enabled: Boolean(sandboxId) && isEnabled,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ activity: TSandboxProxyActivity[] }>(
        `/api/v1/sandboxes/${sandboxId}/proxy-activity`
      );
      return data.activity;
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
