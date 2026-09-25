import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TStripeApiKey } from "./types";

const stripeConnectionKeys = {
  all: [...appConnectionKeys.all, "stripe"] as const,
  listApiKeys: (connectionId: string) =>
    [...stripeConnectionKeys.all, "api-keys", connectionId] as const
};

export const useStripeConnectionListApiKeys = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TStripeApiKey[],
      unknown,
      TStripeApiKey[],
      ReturnType<typeof stripeConnectionKeys.listApiKeys>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: stripeConnectionKeys.listApiKeys(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ apiKeys: TStripeApiKey[] }>(
        `/api/v1/app-connections/stripe/${connectionId}/api-keys`
      );

      return data.apiKeys;
    },
    ...options
  });
};
