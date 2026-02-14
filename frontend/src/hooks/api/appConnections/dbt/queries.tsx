import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TDbtProject } from "./types";

const dbtConnectionKeys = {
  all: [...appConnectionKeys.all, "dbt"] as const,
  listProjects: (connectionId: string) =>
    [...dbtConnectionKeys.all, "projects", connectionId] as const
};

export const useDbtConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDbtProject[],
      unknown,
      TDbtProject[],
      ReturnType<typeof dbtConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: dbtConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TDbtProject[] }>(
        `/api/v1/app-connections/dbt/${connectionId}/projects`,
        {}
      );

      return data.projects;
    },
    ...options
  });
};
