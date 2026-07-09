import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListProxiedServicesDTO, TProxiedService } from "./types";

export const proxiedServiceKeys = {
  all: ["proxiedServices"] as const,
  list: ({ projectId, environment, secretPath }: TListProxiedServicesDTO) =>
    [...proxiedServiceKeys.all, "list", projectId, environment, secretPath] as const,
  byId: (serviceId: string) => [...proxiedServiceKeys.all, "byId", serviceId] as const
};

export const useGetProxiedServices = ({
  projectId,
  environment,
  secretPath,
  enabled = true
}: TListProxiedServicesDTO & { enabled?: boolean }) =>
  useQuery({
    queryKey: proxiedServiceKeys.list({ projectId, environment, secretPath }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ services: TProxiedService[] }>(
        "/api/v1/proxied-services",
        { params: { projectId, environment, secretPath } }
      );
      return data.services;
    },
    enabled
  });

export const useGetProxiedServiceById = ({
  serviceId,
  enabled = true
}: {
  serviceId: string;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: proxiedServiceKeys.byId(serviceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ service: TProxiedService }>(
        `/api/v1/proxied-services/${serviceId}`
      );
      return data.service;
    },
    enabled
  });
