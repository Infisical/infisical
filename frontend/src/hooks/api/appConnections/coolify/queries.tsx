import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCoolifyApplication, TCoolifyProject, TCoolifyProjectEnvironment } from "./types";

const coolifyConnectionKeys = {
  all: [...appConnectionKeys.all, "coolify"] as const,
  listProjects: (connectionId: string) =>
    [...coolifyConnectionKeys.all, connectionId, "projects"] as const,
  listProjectEnvironments: (connectionId: string, projectId: string) =>
    [...coolifyConnectionKeys.listProjects(connectionId), projectId] as const,
  listApplications: (connectionId: string, environmentId: number) =>
    [
      ...coolifyConnectionKeys.listProjects(connectionId),
      "environments",
      environmentId,
      "applications"
    ] as const
};

export const useCoolifyConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCoolifyProject[],
      unknown,
      TCoolifyProject[],
      ReturnType<typeof coolifyConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: coolifyConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCoolifyProject[]>(
        `/api/v1/app-connections/coolify/${connectionId}/projects`
      );

      return data;
    },
    ...options
  });
};

export const useCoolifyConnectionListProjectEnvironments = (
  connectionId: string,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TCoolifyProjectEnvironment[],
      unknown,
      TCoolifyProjectEnvironment[],
      ReturnType<typeof coolifyConnectionKeys.listProjectEnvironments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: coolifyConnectionKeys.listProjectEnvironments(connectionId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCoolifyProjectEnvironment[]>(
        `/api/v1/app-connections/coolify/${connectionId}/projects/${projectId}`
      );

      return data;
    },
    ...options
  });
};

export const useCoolifyConnectionListApplications = (
  connectionId: string,
  environmentId: number,
  options?: Omit<
    UseQueryOptions<
      TCoolifyApplication[],
      unknown,
      TCoolifyApplication[],
      ReturnType<typeof coolifyConnectionKeys.listApplications>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: coolifyConnectionKeys.listApplications(connectionId, environmentId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCoolifyApplication[]>(
        `/api/v1/app-connections/coolify/${connectionId}/environments/${environmentId}/applications`
      );

      return data;
    },
    ...options
  });
};
