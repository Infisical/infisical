import { useQueries, useQuery } from "@tanstack/react-query";

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

export const useListProjectFolderGrants = (sourceProjectId: string, enabled = true) =>
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
    enabled: Boolean(sourceProjectId) && enabled
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

const fetchProjectFolderGrantUsage = async (grantId: string, sourceProjectId: string) => {
  const { data } = await apiRequest.get<TProjectFolderGrantUsage>(
    `/api/v1/project-folder-grants/${grantId}/usage`,
    { params: { sourceProjectId } }
  );
  return data;
};

export const useGetProjectFolderGrantUsage = (
  grantId: string,
  sourceProjectId: string,
  enabled = true
) =>
  useQuery({
    queryKey: projectFolderGrantKeys.usage(grantId, sourceProjectId),
    queryFn: () => fetchProjectFolderGrantUsage(grantId, sourceProjectId),
    enabled: Boolean(grantId) && Boolean(sourceProjectId) && enabled,
    staleTime: 0,
    gcTime: 0
  });

export const useGetProjectFolderGrantsUsageTotal = (
  grantIds: string[],
  sourceProjectId: string,
  enabled = true
) =>
  useQueries({
    queries: grantIds.map((grantId) => ({
      queryKey: projectFolderGrantKeys.usage(grantId, sourceProjectId),
      queryFn: () => fetchProjectFolderGrantUsage(grantId, sourceProjectId),
      enabled: Boolean(sourceProjectId) && enabled,
      staleTime: 0,
      gcTime: 0
    })),
    combine: (results) => ({
      isChecking: results.some((r) => r.isPending || r.isFetching),
      isError: results.some((r) => r.isError),
      total: results.reduce(
        (sum, r) => sum + (r.data?.importCount ?? 0) + (r.data?.referenceCount ?? 0),
        0
      )
    })
  });
