import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TProjectGrant, TProjectGrantReceived } from "./types";

export const projectGrantKeys = {
  listByProject: (sourceProjectId: string) => [{ sourceProjectId }, "project-grants"] as const,
  listReceived: (targetProjectId: string) =>
    [{ targetProjectId }, "project-grants-received"] as const
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

export const useListProjectGrantsReceived = (targetProjectId: string) =>
  useQuery({
    queryKey: projectGrantKeys.listReceived(targetProjectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ grants: TProjectGrantReceived[] }>(
        "/api/v1/project-grants/received",
        {
          params: { targetProjectId }
        }
      );
      return data.grants;
    },
    enabled: Boolean(targetProjectId)
  });
