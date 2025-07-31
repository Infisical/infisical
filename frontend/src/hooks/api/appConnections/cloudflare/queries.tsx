import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCloudflarePagesProject, TCloudflareWorkersScript, TCloudflareZone } from "./types";

const cloudflareConnectionKeys = {
  all: [...appConnectionKeys.all, "cloudflare"] as const,
  listPagesProjects: (connectionId: string) =>
    [...cloudflareConnectionKeys.all, "pages-projects", connectionId] as const,
  listWorkersScripts: (connectionId: string) =>
    [...cloudflareConnectionKeys.all, "workers-scripts", connectionId] as const,
  listZones: (connectionId: string) =>
    [...cloudflareConnectionKeys.all, "zones", connectionId] as const
};

export const useCloudflareConnectionListPagesProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCloudflarePagesProject[],
      unknown,
      TCloudflarePagesProject[],
      ReturnType<typeof cloudflareConnectionKeys.listPagesProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cloudflareConnectionKeys.listPagesProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCloudflarePagesProject[]>(
        `/api/v1/app-connections/cloudflare/${connectionId}/cloudflare-pages-projects`
      );

      return data;
    },
    ...options
  });
};

export const useCloudflareConnectionListWorkersScripts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCloudflareWorkersScript[],
      unknown,
      TCloudflareWorkersScript[],
      ReturnType<typeof cloudflareConnectionKeys.listWorkersScripts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cloudflareConnectionKeys.listWorkersScripts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCloudflareWorkersScript[]>(
        `/api/v1/app-connections/cloudflare/${connectionId}/cloudflare-workers-scripts`
      );

      return data;
    },
    ...options
  });
};

export const useCloudflareConnectionListZones = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCloudflareZone[],
      unknown,
      TCloudflareZone[],
      ReturnType<typeof cloudflareConnectionKeys.listZones>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cloudflareConnectionKeys.listZones(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCloudflareZone[]>(
        `/api/v1/app-connections/cloudflare/${connectionId}/cloudflare-zones`
      );

      return data;
    },
    ...options
  });
};
