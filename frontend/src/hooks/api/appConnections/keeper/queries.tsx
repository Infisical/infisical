import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TKeeperSharedFolder } from "./types";

const keeperConnectionKeys = {
  all: [...appConnectionKeys.all, "keeper"] as const,
  listSharedFolders: (connectionId: string) =>
    [...keeperConnectionKeys.all, "shared-folders", connectionId] as const
};

export const useKeeperConnectionListSharedFolders = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TKeeperSharedFolder[],
      unknown,
      TKeeperSharedFolder[],
      ReturnType<typeof keeperConnectionKeys.listSharedFolders>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: keeperConnectionKeys.listSharedFolders(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ sharedFolders: TKeeperSharedFolder[] }>(
        `/api/v1/app-connections/keeper/${connectionId}/shared-folders`
      );

      return data.sharedFolders;
    },
    ...options
  });
};
