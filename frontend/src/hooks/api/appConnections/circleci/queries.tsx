import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCircleCIProject, TCircleCIProjectListResponse } from "./types";

const circleciConnectionKeys = {
  all: [...appConnectionKeys.all, "circleci"] as const,
  listProjects: (connectionId: string) => [...circleciConnectionKeys.all, "projects", connectionId] as const
};

export const useCircleCIConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCircleCIProject[],
      unknown,
      TCircleCIProject[],
      ReturnType<typeof circleciConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: circleciConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCircleCIProjectListResponse>(
        `/api/v1/app-connections/circleci/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};
