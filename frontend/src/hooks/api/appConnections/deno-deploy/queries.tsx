import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TDenoDeployApp } from "./types";

const denoDeployConnectionKeys = {
  all: [...appConnectionKeys.all, "deno-deploy"] as const,
  listApps: (connectionId: string) =>
    [...denoDeployConnectionKeys.all, "apps", connectionId] as const
};

export const useDenoDeployConnectionListApps = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDenoDeployApp[],
      unknown,
      TDenoDeployApp[],
      ReturnType<typeof denoDeployConnectionKeys.listApps>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: denoDeployConnectionKeys.listApps(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDenoDeployApp[]>(
        `/api/v1/app-connections/deno-deploy/${connectionId}/apps`
      );

      return data;
    },
    ...options
  });
};
