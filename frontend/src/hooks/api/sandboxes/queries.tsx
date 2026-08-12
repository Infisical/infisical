import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSandbox } from "./types";

// Mirrors PAM: the sandbox project is hidden, resolved (and bootstrapped) on first visit so the
// Project and ProjectPermission contexts have something to hang off.
export const fetchSandboxProjectId = async () => {
  const { data } = await apiRequest.get<{ projectId: string }>("/api/v1/sandboxes/project");
  return data.projectId;
};

export const sandboxKeys = {
  all: () => ["sandboxes"] as const,
  list: () => [...sandboxKeys.all(), "list"] as const,
  byId: (sandboxId: string) => [...sandboxKeys.all(), "detail", sandboxId] as const
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
