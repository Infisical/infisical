import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TTriggerDevEnvironment, TTriggerDevProject } from "./types";

const triggerDevConnectionKeys = {
  all: [...appConnectionKeys.all, "trigger-dev"] as const,
  listProjects: (connectionId: string) =>
    [...triggerDevConnectionKeys.all, "projects", connectionId] as const,
  listEnvironments: (connectionId: string, projectRef: string) =>
    [...triggerDevConnectionKeys.all, "environments", connectionId, projectRef] as const
};

export const useTriggerDevConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TTriggerDevProject[],
      unknown,
      TTriggerDevProject[],
      ReturnType<typeof triggerDevConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: triggerDevConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TTriggerDevProject[]>(
        `/api/v1/app-connections/trigger-dev/${connectionId}/projects`
      );

      return data;
    },
    ...options
  });
};

export const useTriggerDevConnectionListEnvironments = (
  connectionId: string,
  projectRef: string,
  options?: Omit<
    UseQueryOptions<
      TTriggerDevEnvironment[],
      unknown,
      TTriggerDevEnvironment[],
      ReturnType<typeof triggerDevConnectionKeys.listEnvironments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: triggerDevConnectionKeys.listEnvironments(connectionId, projectRef),
    queryFn: async () => {
      const { data } = await apiRequest.get<TTriggerDevEnvironment[]>(
        `/api/v1/app-connections/trigger-dev/${connectionId}/environments`,
        { params: { projectRef } }
      );

      return data;
    },
    ...options
  });
};
