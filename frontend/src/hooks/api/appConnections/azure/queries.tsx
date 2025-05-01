import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TAzureClient } from "./types";

const azureConnectionKeys = {
  all: [...appConnectionKeys.all, "azure"] as const,
  listClients: (connectionId: string) =>
    [...azureConnectionKeys.all, "clients", connectionId] as const
};

export const useAzureConnectionListClients = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TAzureClient[],
      unknown,
      TAzureClient[],
      ReturnType<typeof azureConnectionKeys.listClients>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: azureConnectionKeys.listClients(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ clients: TAzureClient[] }>(
        `/api/v1/app-connections/azure-client-secrets/${connectionId}/clients`
      );

      return data.clients;
    },
    ...options
  });
};
