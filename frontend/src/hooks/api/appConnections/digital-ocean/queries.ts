import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TDigitalOceanApp } from "./types";

const digitalOceanAppPlatformConnectionKeys = {
  all: [...appConnectionKeys.all, "digitalOceanAppPlatform"] as const,
  listAccounts: (connectionId: string) =>
    [...digitalOceanAppPlatformConnectionKeys.all, "workspace-scopes", connectionId] as const
};

export const useDigitalOceanConnectionListApps = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDigitalOceanApp[],
      unknown,
      TDigitalOceanApp[],
      ReturnType<typeof digitalOceanAppPlatformConnectionKeys.listAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: digitalOceanAppPlatformConnectionKeys.listAccounts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ apps: TDigitalOceanApp[] }>(
        `/api/v1/app-connections/digital-ocean/${connectionId}/apps`
      );

      return data.apps;
    },
    ...options
  });
};
