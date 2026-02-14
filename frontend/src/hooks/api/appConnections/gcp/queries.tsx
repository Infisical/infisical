import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGcpLocation, TGcpProject, TListProjectLocations } from "./types";

const gcpConnectionKeys = {
  all: [...appConnectionKeys.all, "gcp"] as const,
  listProjects: (connectionId: string) =>
    [...gcpConnectionKeys.all, "projects", connectionId] as const,
  listProjectLocations: ({ projectId, connectionId }: TListProjectLocations) =>
    [...gcpConnectionKeys.all, "project-locations", connectionId, projectId] as const
};

export const useGcpConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGcpProject[],
      unknown,
      TGcpProject[],
      ReturnType<typeof gcpConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gcpConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGcpProject[]>(
        `/api/v1/app-connections/gcp/${connectionId}/secret-manager-projects`,
        {}
      );

      return data;
    },
    ...options
  });
};

export const useGcpConnectionListProjectLocations = (
  { connectionId, projectId }: TListProjectLocations,
  options?: Omit<
    UseQueryOptions<
      TGcpLocation[],
      unknown,
      TGcpLocation[],
      ReturnType<typeof gcpConnectionKeys.listProjectLocations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gcpConnectionKeys.listProjectLocations({ connectionId, projectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGcpLocation[]>(
        `/api/v1/app-connections/gcp/${connectionId}/secret-manager-project-locations`,
        { params: { projectId } }
      );

      return data;
    },
    ...options
  });
};
