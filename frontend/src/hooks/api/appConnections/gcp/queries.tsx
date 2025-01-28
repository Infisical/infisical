import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGcpProject } from "./types";

const gcpConnectionKeys = {
  all: [...appConnectionKeys.all, "gcp"] as const,
  listProjects: (connectionId: string) =>
    [...gcpConnectionKeys.all, "projects", connectionId] as const
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
        `/api/v1/app-connections/gcp/${connectionId}/secret-manager-projects`
      );

      return data;
    },
    ...options
  });
};
