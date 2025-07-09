import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCloudflarePagesProject, TCloudflareWorkersProject } from "./types";

const cloudflareConnectionKeys = {
  all: [...appConnectionKeys.all, "cloudflare"] as const,
  listPagesProjects: (connectionId: string) =>
    [...cloudflareConnectionKeys.all, "pages-projects", connectionId] as const,
  listWorkersProjects: (connectionId: string) =>
    [...cloudflareConnectionKeys.all, "workers-projects", connectionId] as const
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

export const useCloudflareConnectionListWorkersProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCloudflareWorkersProject[],
      unknown,
      TCloudflareWorkersProject[],
      ReturnType<typeof cloudflareConnectionKeys.listWorkersProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cloudflareConnectionKeys.listWorkersProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCloudflareWorkersProject[]>(
        `/api/v1/app-connections/cloudflare/${connectionId}/cloudflare-workers-projects`
      );

      return data;
    },
    ...options
  });
};
