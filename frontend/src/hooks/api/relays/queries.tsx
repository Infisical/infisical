import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TRelay, TRelayWithAuthMethod } from "./types";

export type TRelayConnectedGateway = {
  id: string;
  name: string;
  createdAt: string;
  heartbeat: string | null;
};

export const relayQueryKeys = {
  list: () => ["relays"] as const,
  byId: (relayId: string) => [{ relayId }, "relay"] as const,
  connectedGateways: (relayId: string) => [{ relayId }, "relay-connected-gateways"] as const
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

const fetchRelayConnectedGateways = async (relayId: string): Promise<TRelayConnectedGateway[]> => {
  const { data } = await apiRequest.get<TRelayConnectedGateway[]>(`/api/v2/relays/${relayId}/gateways`);
  return data;
};

export const useGetRelayConnectedGateways = (relayId: string) => {
  return useQuery({
    queryKey: relayQueryKeys.connectedGateways(relayId),
    queryFn: () => fetchRelayConnectedGateways(relayId),
    enabled: Boolean(relayId)
  });
};
