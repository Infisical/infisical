import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TOnePassVault } from "./types";

const onePassConnectionKeys = {
  all: [...appConnectionKeys.all, "1password"] as const,
  listVaults: (connectionId: string) =>
    [...onePassConnectionKeys.all, "vaults", connectionId] as const
};

export const useOnePassConnectionListVaults = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TOnePassVault[],
      unknown,
      TOnePassVault[],
      ReturnType<typeof onePassConnectionKeys.listVaults>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: onePassConnectionKeys.listVaults(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOnePassVault[]>(
        `/api/v1/app-connections/1password/${connectionId}/vaults`,
        {}
      );

      return data;
    },
    ...options
  });
};
