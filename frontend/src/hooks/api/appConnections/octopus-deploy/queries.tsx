import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TOctopusDeployProject, TOctopusDeployScopeValues, TOctopusDeploySpace } from "./types";

const octopusDeployConnectionKeys = {
  all: [...appConnectionKeys.all, "octopus-deploy"] as const,
  listSpaces: (connectionId: string) =>
    [...octopusDeployConnectionKeys.all, "spaces", connectionId] as const,
  listProjects: (connectionId: string, spaceId: string) =>
    [...octopusDeployConnectionKeys.all, "projects", connectionId, spaceId] as const,
  getScopeValues: (connectionId: string, spaceId: string, projectId: string) =>
    [...octopusDeployConnectionKeys.all, "scope-values", connectionId, spaceId, projectId] as const
};

export const useOctopusDeployConnectionListSpaces = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TOctopusDeploySpace[],
      unknown,
      TOctopusDeploySpace[],
      ReturnType<typeof octopusDeployConnectionKeys.listSpaces>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: octopusDeployConnectionKeys.listSpaces(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOctopusDeploySpace[]>(
        `/api/v1/app-connections/octopus-deploy/${connectionId}/spaces`,
        {}
      );

      return data;
    },
    ...options
  });
};

export const useOctopusDeployConnectionListProjects = (
  connectionId: string,
  spaceId: string,
  options?: Omit<
    UseQueryOptions<
      TOctopusDeployProject[],
      unknown,
      TOctopusDeployProject[],
      ReturnType<typeof octopusDeployConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: octopusDeployConnectionKeys.listProjects(connectionId, spaceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOctopusDeployProject[]>(
        `/api/v1/app-connections/octopus-deploy/${connectionId}/projects`,
        {
          params: { spaceId }
        }
      );

      return data;
    },
    ...options
  });
};

export const useOctopusDeployConnectionGetScopeValues = (
  connectionId: string,
  spaceId: string,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TOctopusDeployScopeValues,
      unknown,
      TOctopusDeployScopeValues,
      ReturnType<typeof octopusDeployConnectionKeys.getScopeValues>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: octopusDeployConnectionKeys.getScopeValues(connectionId, spaceId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOctopusDeployScopeValues>(
        `/api/v1/app-connections/octopus-deploy/${connectionId}/scope-values`,
        { params: { spaceId, projectId } }
      );

      return data;
    },
    ...options
  });
};
