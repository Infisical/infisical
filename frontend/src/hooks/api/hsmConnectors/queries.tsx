import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { THsmConnector, THsmConnectorLinkedCertificate } from "./types";

export const hsmConnectorKeys = {
  all: ["hsm-connectors"] as const,
  list: () => [...hsmConnectorKeys.all, "list"] as const,
  byId: (id: string) => [...hsmConnectorKeys.all, "by-id", id] as const,
  linkedCertificatesAll: (id: string) =>
    [...hsmConnectorKeys.all, "linked-certificates", id] as const,
  linkedCertificates: (id: string, pagination: { offset: number; limit: number }) =>
    [...hsmConnectorKeys.linkedCertificatesAll(id), pagination] as const
};

export const useListHsmConnectors = (
  options?: Omit<UseQueryOptions<THsmConnector[]>, "queryKey" | "queryFn">
) => {
  return useQuery({
    queryKey: hsmConnectorKeys.list(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ hsmConnectors: THsmConnector[] }>(
        "/api/v1/cert-manager/hsm-connectors"
      );
      return data.hsmConnectors;
    },
    ...options
  });
};

export const useGetHsmConnectorById = (
  connectorId: string | undefined,
  options?: Omit<UseQueryOptions<THsmConnector>, "queryKey" | "queryFn">
) => {
  return useQuery({
    ...options,
    queryKey: hsmConnectorKeys.byId(connectorId ?? ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ hsmConnector: THsmConnector }>(
        `/api/v1/cert-manager/hsm-connectors/${connectorId}`
      );
      return data.hsmConnector;
    },
    enabled: Boolean(connectorId) && (options?.enabled ?? true)
  });
};

export const useListHsmConnectorLinkedCertificates = (
  connectorId: string | undefined,
  pagination?: { offset?: number; limit?: number },
  options?: Omit<
    UseQueryOptions<{ linkedCertificates: THsmConnectorLinkedCertificate[]; totalCount: number }>,
    "queryKey" | "queryFn"
  >
) => {
  const { offset = 0, limit = 20 } = pagination || {};

  return useQuery({
    ...options,
    queryKey: hsmConnectorKeys.linkedCertificates(connectorId ?? "", { offset, limit }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        linkedCertificates: THsmConnectorLinkedCertificate[];
        totalCount: number;
      }>(`/api/v1/cert-manager/hsm-connectors/${connectorId}/linked-certificates`, {
        params: { offset, limit }
      });
      return {
        linkedCertificates: data.linkedCertificates ?? [],
        totalCount: data.totalCount ?? 0
      };
    },
    placeholderData: (prev) => prev,
    enabled: Boolean(connectorId) && (options?.enabled ?? true)
  });
};
