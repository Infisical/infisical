import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TProjectFolderGrant, TProjectFolderGrantReceived } from "./types";

export const projectFolderGrantKeys = {
  listByProject: (sourceProjectId: string) => [{ sourceProjectId }, "project-folder-grants"] as const,
  listReceived: (targetProjectId: string) =>
    [{ targetProjectId }, "project-folder-grants-received"] as const
};

export const useListProjectFolderGrants = (sourceProjectId: string) =>
  useQuery({
    queryKey: projectFolderGrantKeys.listByProject(sourceProjectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ grants: TProjectFolderGrant[] }>("/api/v1/project-folder-grants", {
        params: { sourceProjectId }
      });
      return data.grants;
    },
    enabled: Boolean(sourceProjectId)
  });

export const useListProjectFolderGrantsReceived = (targetProjectId: string) =>
  useQuery({
    queryKey: projectFolderGrantKeys.listReceived(targetProjectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ grants: TProjectFolderGrantReceived[] }>(
        "/api/v1/project-folder-grants/received",
        {
          params: { targetProjectId }
        }
      );
      return data.grants;
    },
    enabled: Boolean(targetProjectId)
  });
