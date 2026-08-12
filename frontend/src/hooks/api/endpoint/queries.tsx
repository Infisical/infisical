import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TEndpointCounter,
  TEndpointDevice,
  TEndpointNetworkRule,
  TListEndpointCountersDTO,
  TListEndpointEventsDTO,
  TListEndpointEventsResponse
} from "./types";

// Resolves the org's Endpoint project, creating it on first access (lazy bootstrap on the backend).
export const fetchEndpointProjectId = async () => {
  const { data } = await apiRequest.get<{ projectId: string }>("/api/v1/endpoint/project");
  return data.projectId;
};

// Prefix-array keys so a partial key invalidates the whole subtree.
export const endpointKeys = {
  all: ["endpoint"] as const,
  project: () => [...endpointKeys.all, "project"] as const,
  devices: () => [...endpointKeys.all, "devices"] as const,
  listDevices: () => [...endpointKeys.devices(), "list"] as const,
  networkRules: () => [...endpointKeys.all, "network-rules"] as const,
  listNetworkRules: () => [...endpointKeys.networkRules(), "list"] as const,
  events: () => [...endpointKeys.all, "events"] as const,
  listEvents: (params?: TListEndpointEventsDTO) =>
    [...endpointKeys.events(), "list", params] as const,
  counters: () => [...endpointKeys.all, "counters"] as const,
  listCounters: (params?: TListEndpointCountersDTO) =>
    [...endpointKeys.counters(), "list", params] as const
};

// The counter is the thing an admin watches climb, so it overrides the 60s global staleTime and
// polls at the agent's own heartbeat cadence.
export const useListEndpointCounters = (
  params: TListEndpointCountersDTO = {},
  options?: Omit<UseQueryOptions<TEndpointCounter[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listCounters(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ counters: TEndpointCounter[] }>(
        "/api/v1/endpoint/counters",
        { params }
      );
      return data.counters;
    },
    refetchInterval: 1000,
    staleTime: 0,
    ...options
  });

export const useListEndpointDevices = (
  options?: Omit<UseQueryOptions<TEndpointDevice[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listDevices(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ devices: TEndpointDevice[] }>(
        "/api/v1/endpoint/devices"
      );
      return data.devices;
    },
    ...options
  });

export const useListEndpointNetworkRules = (
  options?: Omit<UseQueryOptions<TEndpointNetworkRule[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listNetworkRules(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ networkRules: TEndpointNetworkRule[] }>(
        "/api/v1/endpoint/network-rules"
      );
      return data.networkRules;
    },
    ...options
  });

export const useListEndpointEvents = (
  params: TListEndpointEventsDTO = {},
  options?: Omit<UseQueryOptions<TListEndpointEventsResponse>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listEvents(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListEndpointEventsResponse>(
        "/api/v1/endpoint/events",
        { params }
      );
      return data;
    },
    ...options
  });
