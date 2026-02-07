import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TSupabaseProject, TSupabaseProjectBranch } from "./types";

const supabaseConnectionKeys = {
  all: [...appConnectionKeys.all, "supabase"] as const,
  listProjects: (connectionId: string) =>
    [...supabaseConnectionKeys.all, "workspace-scopes", connectionId] as const,
  listProjectBranches: (connectionId: string, projectId: string) =>
    [...supabaseConnectionKeys.all, "workspace-scopes", connectionId, projectId] as const
};

export const useSupabaseConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TSupabaseProject[],
      unknown,
      TSupabaseProject[],
      ReturnType<typeof supabaseConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: supabaseConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TSupabaseProject[] }>(
        `/api/v1/app-connections/supabase/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};

export const useSupabaseConnectionListProjectBranches = (
  connectionId: string,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TSupabaseProjectBranch[],
      unknown,
      TSupabaseProjectBranch[],
      ReturnType<typeof supabaseConnectionKeys.listProjectBranches>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: supabaseConnectionKeys.listProjectBranches(connectionId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ branches: TSupabaseProjectBranch[] }>(
        `/api/v1/app-connections/supabase/${connectionId}/projects/${projectId}/branches`
      );

      return data.branches;
    },
    ...options
  });
};
