import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TProjectGrant } from "./types";

export const projectGrantKeys = {
  listByProject: (sourceProjectId: string) => [{ sourceProjectId }, "project-grants"] as const
};

export const useListProjectGrants = (sourceProjectId: string) =>
  useQuery({
    queryKey: projectGrantKeys.listByProject(sourceProjectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ grants: TProjectGrant[] }>("/api/v1/project-grants", {
        params: { sourceProjectId }
      });
      return data.grants;
    },
    enabled: Boolean(sourceProjectId)
  });
