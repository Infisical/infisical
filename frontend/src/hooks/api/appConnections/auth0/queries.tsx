import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TAuth0Client } from "./types";

const auth0ConnectionKeys = {
  all: [...appConnectionKeys.all, "auth0"] as const,
  listClients: (connectionId: string) =>
    [...auth0ConnectionKeys.all, "clients", connectionId] as const
};

export const useAuth0ConnectionListClients = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TAuth0Client[],
      unknown,
      TAuth0Client[],
      ReturnType<typeof auth0ConnectionKeys.listClients>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: auth0ConnectionKeys.listClients(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ clients: TAuth0Client[] }>(
        `/api/v1/app-connections/auth0/${connectionId}/clients`
      );

      return data.clients;
    },
    ...options
  });
};
