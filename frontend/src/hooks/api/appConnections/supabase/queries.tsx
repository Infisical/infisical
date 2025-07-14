import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TSupabaseProject } from "./types";

const checklyConnectionKeys = {
  all: [...appConnectionKeys.all, "supabase"] as const,
  listProjects: (connectionId: string) =>
    [...checklyConnectionKeys.all, "workspace-scopes", connectionId] as const
};

export const useSupabaseConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TSupabaseProject[],
      unknown,
      TSupabaseProject[],
      ReturnType<typeof checklyConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: checklyConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TSupabaseProject[] }>(
        `/api/v1/app-connections/checkly/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};
