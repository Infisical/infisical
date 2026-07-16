import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TProjectFolderGrant,
  TProjectFolderGrantReceived,
  TProjectFolderGrantUsage
} from "./types";

export const projectFolderGrantKeys = {
  listByProject: (sourceProjectId: string) =>
    [{ sourceProjectId }, "project-folder-grants"] as const,
  listReceived: (targetProjectId: string) =>
    [{ targetProjectId }, "project-folder-grants-received"] as const,
  usage: (grantId: string, sourceProjectId: string) =>
    [{ grantId, sourceProjectId }, "project-folder-grant-usage"] as const
};

export const useListProjectFolderGrants = (sourceProjectId: string) =>
  useQuery({
    queryKey: projectFolderGrantKeys.listByProject(sourceProjectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ grants: TProjectFolderGrant[] }>(
        "/api/v1/project-folder-grants",
        {
          params: { sourceProjectId }
        }
      );
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

export const useGetProjectFolderGrantUsage = (
  grantId: string,
  sourceProjectId: string,
  enabled = true
) =>
  useQuery({
    queryKey: projectFolderGrantKeys.usage(grantId, sourceProjectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectFolderGrantUsage>(
        `/api/v1/project-folder-grants/${grantId}/usage`,
        { params: { sourceProjectId } }
      );
      return data;
    },
    enabled: Boolean(grantId) && Boolean(sourceProjectId) && enabled
  });
