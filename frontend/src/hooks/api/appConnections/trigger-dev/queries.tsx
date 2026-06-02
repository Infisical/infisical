import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TTriggerDevProject } from "./types";

const triggerDevConnectionKeys = {
  all: [...appConnectionKeys.all, "trigger-dev"] as const,
  listProjects: (connectionId: string) =>
    [...triggerDevConnectionKeys.all, "projects", connectionId] as const
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
