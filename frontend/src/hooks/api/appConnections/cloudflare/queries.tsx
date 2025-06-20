import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCloudflareProject } from "./types";

const cloudflareConnectionKeys = {
  all: [...appConnectionKeys.all, "cloudflare"] as const,
  listPagesProjects: (connectionId: string) =>
    [...cloudflareConnectionKeys.all, "pages-projects", connectionId] as const
};

export const useCloudflareConnectionListPagesProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCloudflareProject[],
      unknown,
      TCloudflareProject[],
      ReturnType<typeof cloudflareConnectionKeys.listPagesProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cloudflareConnectionKeys.listPagesProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCloudflareProject[]>(
        `/api/v1/app-connections/cloudflare/${connectionId}/cloudflare-pages-projects`
      );

      return data;
    },
    ...options
  });
};
