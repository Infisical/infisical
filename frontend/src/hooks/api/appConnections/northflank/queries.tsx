import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TNorthflankProject, TNorthflankSecretGroup } from "./types";

const northflankConnectionKeys = {
  all: [...appConnectionKeys.all, "northflank"] as const,
  listProjects: (connectionId: string) =>
    [...northflankConnectionKeys.all, "projects", connectionId] as const,
  listSecretGroups: (connectionId: string, projectId: string) =>
    [...northflankConnectionKeys.all, "secret-groups", connectionId, projectId] as const
};

export const useNorthflankConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TNorthflankProject[],
      unknown,
      TNorthflankProject[],
      ReturnType<typeof northflankConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: northflankConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TNorthflankProject[] }>(
        `/api/v1/app-connections/northflank/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};

export const useNorthflankConnectionListSecretGroups = (
  connectionId: string,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TNorthflankSecretGroup[],
      unknown,
      TNorthflankSecretGroup[],
      ReturnType<typeof northflankConnectionKeys.listSecretGroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: northflankConnectionKeys.listSecretGroups(connectionId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ secretGroups: TNorthflankSecretGroup[] }>(
        `/api/v1/app-connections/northflank/${connectionId}/projects/${projectId}/secret-groups`
      );

      return data.secretGroups;
    },
    ...options
  });
};
