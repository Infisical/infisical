import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListProxiedServicesDTO, TProxiedService } from "./types";

export const proxiedServiceKeys = {
  all: ["proxiedServices"] as const,
  list: ({ projectId, search }: TListProxiedServicesDTO) =>
    [...proxiedServiceKeys.all, "list", { projectId, search }] as const,
  byId: (serviceId: string) => [...proxiedServiceKeys.all, "byId", serviceId] as const
};

export const useListProxiedServices = ({ projectId, search }: TListProxiedServicesDTO) =>
  useQuery({
    queryKey: proxiedServiceKeys.list({ projectId, search }),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ services: TProxiedService[]; totalCount: number }>(
        "/api/v1/proxied-services",
        { params: { projectId, ...(search ? { search } : {}) } }
      );
      return data;
    }
  });

export const useGetProxiedServiceById = (serviceId: string) =>
  useQuery({
    queryKey: proxiedServiceKeys.byId(serviceId),
    enabled: Boolean(serviceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ service: TProxiedService }>(
        `/api/v1/proxied-services/${serviceId}`
      );
      return data.service;
    }
  });
