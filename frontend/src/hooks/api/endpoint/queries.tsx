import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TEndpointDevice,
  TEndpointEgressRule,
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
  egressRules: () => [...endpointKeys.all, "egress-rules"] as const,
  listEgressRules: () => [...endpointKeys.egressRules(), "list"] as const,
  events: () => [...endpointKeys.all, "events"] as const,
  listEvents: (params?: TListEndpointEventsDTO) =>
    [...endpointKeys.events(), "list", params] as const
};

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

export const useListEndpointEgressRules = (
  options?: Omit<UseQueryOptions<TEndpointEgressRule[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listEgressRules(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ egressRules: TEndpointEgressRule[] }>(
        "/api/v1/endpoint/egress-rules"
      );
      return data.egressRules;
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
