import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TRelay, TRelayWithAuthMethod } from "./types";

export const relayQueryKeys = {
  list: () => ["relays"] as const,
  byId: (relayId: string) => [{ relayId }, "relay"] as const
};

const fetchRelays = async (): Promise<TRelay[]> => {
  const { data } = await apiRequest.get<TRelay[]>("/api/v1/relays");
  return data;
};

const fetchRelayById = async (relayId: string): Promise<TRelayWithAuthMethod> => {
  const { data } = await apiRequest.get<TRelayWithAuthMethod>(`/api/v2/relays/${relayId}`);
  return data;
};

export const useGetRelays = () => {
  return useQuery({
    queryKey: relayQueryKeys.list(),
    queryFn: fetchRelays
  });
};

export const useGetRelayById = (relayId: string) => {
  return useQuery({
    queryKey: relayQueryKeys.byId(relayId),
    queryFn: () => fetchRelayById(relayId),
    enabled: Boolean(relayId),
    staleTime: 0,
    gcTime: 0
  });
};
