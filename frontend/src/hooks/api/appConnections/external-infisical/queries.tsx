import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TRemoteInfisicalEnvironmentFolderTree,
  TRemoteInfisicalProject
} from "./types";

const externalInfisicalConnectionKeys = {
  all: [...appConnectionKeys.all, "external-infisical"] as const,
  listProjects: (connectionId: string) =>
    [...externalInfisicalConnectionKeys.all, "projects", connectionId] as const,
  getEnvironmentFolderTree: (connectionId: string, projectId: string) =>
    [
      ...externalInfisicalConnectionKeys.all,
      "environment-folder-tree",
      connectionId,
      projectId
    ] as const
};

export const useExternalInfisicalConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TRemoteInfisicalProject[],
      unknown,
      TRemoteInfisicalProject[],
      ReturnType<typeof externalInfisicalConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: externalInfisicalConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TRemoteInfisicalProject[] }>(
        `/api/v1/app-connections/external-infisical/${connectionId}/projects`
      );
      return data.projects;
    },
    ...options
  });
};

export const useExternalInfisicalConnectionGetEnvironmentFolderTree = (
  connectionId: string,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TRemoteInfisicalEnvironmentFolderTree,
      unknown,
      TRemoteInfisicalEnvironmentFolderTree,
      ReturnType<typeof externalInfisicalConnectionKeys.getEnvironmentFolderTree>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: externalInfisicalConnectionKeys.getEnvironmentFolderTree(connectionId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TRemoteInfisicalEnvironmentFolderTree>(
        `/api/v1/app-connections/external-infisical/${connectionId}/projects/${projectId}/environment-folder-tree`
      );
      return data ?? {};
    },
    ...options
  });
};
