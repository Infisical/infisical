import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  EndpointCommandStatus,
  TEndpointCommand,
  TEndpointCounter,
  TEndpointDevice,
  TEndpointNetworkRule,
  TEndpointTarget,
  TListEndpointCommandsDTO,
  TListEndpointCommandsResponse,
  TListEndpointCountersDTO,
  TListEndpointDeviceAppsDTO,
  TListEndpointDeviceAppsResponse,
  TListEndpointEventsDTO,
  TListEndpointEventsResponse,
  TListEndpointTransfersDTO,
  TListEndpointTransfersResponse
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
  targets: () => [...endpointKeys.all, "targets"] as const,
  listTargets: () => [...endpointKeys.targets(), "list"] as const,
  events: () => [...endpointKeys.all, "events"] as const,
  listEvents: (params?: TListEndpointEventsDTO) =>
    [...endpointKeys.events(), "list", params] as const,
  counters: () => [...endpointKeys.all, "counters"] as const,
  listCounters: (params?: TListEndpointCountersDTO) =>
    [...endpointKeys.counters(), "list", params] as const,
  transfers: () => [...endpointKeys.all, "transfers"] as const,
  listTransfers: (params?: TListEndpointTransfersDTO) =>
    [...endpointKeys.transfers(), "list", params] as const,
  commands: () => [...endpointKeys.all, "commands"] as const,
  listCommands: (params?: TListEndpointCommandsDTO) =>
    [...endpointKeys.commands(), "list", params] as const,
  apps: () => [...endpointKeys.all, "apps"] as const,
  listApps: (params: TListEndpointDeviceAppsDTO) =>
    [...endpointKeys.apps(), "list", params] as const
};

// A command not yet reported on is the one state worth polling for: the agent claims every few
// seconds and the result lands whenever the command finishes, so nothing pushes it to the console.
const IN_FLIGHT_STATUSES = new Set<EndpointCommandStatus>([
  EndpointCommandStatus.Pending,
  EndpointCommandStatus.Dispatched
]);

export const isEndpointCommandInFlight = (command: TEndpointCommand) =>
  IN_FLIGHT_STATUSES.has(command.status);

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

// History is written a minute at a time, so it refreshes on a slower beat than the live counter — but
// still on its own, because the row for the transfer happening right now keeps growing.
export const useListEndpointTransfers = (
  params: TListEndpointTransfersDTO = {},
  options?: Omit<UseQueryOptions<TListEndpointTransfersResponse>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listTransfers(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListEndpointTransfersResponse>(
        "/api/v1/endpoint/transfers",
        { params }
      );
      return data;
    },
    refetchInterval: 15_000,
    staleTime: 0,
    ...options
  });

// What is installed changes on the order of days and the agent reports it every half hour, so this
// takes the global 60s staleTime rather than polling: there is nothing here that moves while an
// admin is looking at it.
export const useListEndpointDeviceApps = (
  params: TListEndpointDeviceAppsDTO,
  options?: Omit<UseQueryOptions<TListEndpointDeviceAppsResponse>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listApps(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListEndpointDeviceAppsResponse>(
        "/api/v1/endpoint/apps",
        { params }
      );
      return data;
    },
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

export const useListEndpointTargets = (
  options?: Omit<UseQueryOptions<TEndpointTarget[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listTargets(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ targets: TEndpointTarget[] }>(
        "/api/v1/endpoint/targets"
      );
      return data.targets;
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

export const useListEndpointCommands = (
  params: TListEndpointCommandsDTO = {},
  options?: Omit<UseQueryOptions<TListEndpointCommandsResponse>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointKeys.listCommands(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListEndpointCommandsResponse>(
        "/api/v1/endpoint/commands",
        { params }
      );
      return data;
    },
    // Polls only while something is actually outstanding, so an idle console stops asking.
    refetchInterval: (query) =>
      query.state.data?.commands.some(isEndpointCommandInFlight) ? 3000 : false,
    staleTime: 0,
    ...options
  });

// The layout already resolved this into the cache before any page rendered, so this is a cache read
// rather than a request. Infinite staleTime: an org's Endpoint project id does not change.
export const useEndpointProjectId = () =>
  useQuery({
    queryKey: endpointKeys.project(),
    queryFn: fetchEndpointProjectId,
    staleTime: Infinity
  });
