import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TOpenAIProject } from "./types";

const openaiConnectionKeys = {
  all: [...appConnectionKeys.all, "openai"] as const,
  listProjects: (connectionId: string) =>
    [...openaiConnectionKeys.all, "projects", connectionId] as const
};

export const useListOpenAIConnectionProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TOpenAIProject[],
      unknown,
      TOpenAIProject[],
      ReturnType<typeof openaiConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: openaiConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TOpenAIProject[] }>(
        `/api/v1/app-connections/openai/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};
