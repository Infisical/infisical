import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TFireworksServiceAccount } from "./types";

const fireworksConnectionKeys = {
  all: [...appConnectionKeys.all, "fireworks"] as const,
  listServiceAccounts: (connectionId: string) =>
    [...fireworksConnectionKeys.all, "service-accounts", connectionId] as const
};

export const useFireworksConnectionListServiceAccounts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TFireworksServiceAccount[],
      unknown,
      TFireworksServiceAccount[],
      ReturnType<typeof fireworksConnectionKeys.listServiceAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: fireworksConnectionKeys.listServiceAccounts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ serviceAccounts: TFireworksServiceAccount[] }>(
        `/api/v1/app-connections/fireworks/${connectionId}/service-accounts`
      );

      return data.serviceAccounts;
    },
    ...options
  });
};
