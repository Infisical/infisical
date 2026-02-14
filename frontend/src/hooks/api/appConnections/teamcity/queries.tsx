import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TTeamCityProjectWithBuildTypes } from "./types";

const teamcityConnectionKeys = {
  all: [...appConnectionKeys.all, "teamcity"] as const,
  listProjects: (connectionId: string) =>
    [...teamcityConnectionKeys.all, "projects", connectionId] as const
};

export const useTeamCityConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TTeamCityProjectWithBuildTypes[],
      unknown,
      TTeamCityProjectWithBuildTypes[],
      ReturnType<typeof teamcityConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: teamcityConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TTeamCityProjectWithBuildTypes[]>(
        `/api/v1/app-connections/teamcity/${connectionId}/projects`,
        {}
      );

      return data;
    },
    ...options
  });
};
