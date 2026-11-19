import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  THsmConnector,
  THsmConnectorKey,
  THsmConnectorLinkedCertificate,
  THsmConnectorLinkedCertificateAuthority
} from "./types";

export const hsmConnectorKeys = {
  all: ["hsm-connectors"] as const,
  list: () => [...hsmConnectorKeys.all, "list"] as const,
  byId: (id: string) => [...hsmConnectorKeys.all, "by-id", id] as const,
  keys: (id: string, label: string) => [...hsmConnectorKeys.all, "keys", id, label] as const,
  linkedResourcesAll: (id: string) => [...hsmConnectorKeys.all, "linked-resources", id] as const,
  linkedResources: (id: string, pagination: { offset: number; limit: number }) =>
    [...hsmConnectorKeys.linkedResourcesAll(id), pagination] as const
};

export const useListHsmConnectors = (
  options?: Omit<UseQueryOptions<THsmConnector[]>, "queryKey" | "queryFn">
) => {
  return useQuery({
    ...options,
    queryKey: hsmConnectorKeys.list(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ hsmConnectors: THsmConnector[] }>(
        "/api/v1/cert-manager/hsm-connectors"
      );
      return data.hsmConnectors;
    }
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

export const useListHsmConnectorLinkedResources = (
  connectorId: string | undefined,
  pagination?: { offset?: number; limit?: number },
  options?: Omit<
    UseQueryOptions<{
      certificates: THsmConnectorLinkedCertificate[];
      certificateAuthorities: THsmConnectorLinkedCertificateAuthority[];
      totalCount: number;
    }>,
    "queryKey" | "queryFn"
  >
) => {
  const { offset = 0, limit = 20 } = pagination || {};

  return useQuery({
    ...options,
    queryKey: hsmConnectorKeys.linkedResources(connectorId ?? "", { offset, limit }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificates: THsmConnectorLinkedCertificate[];
        certificateAuthorities: THsmConnectorLinkedCertificateAuthority[];
        totalCount: number;
      }>(`/api/v1/cert-manager/hsm-connectors/${connectorId}/linked-resources`, {
        params: { offset, limit }
      });
      return {
        certificates: data.certificates ?? [],
        certificateAuthorities: data.certificateAuthorities ?? [],
        totalCount: data.totalCount ?? 0
      };
    },
    placeholderData: (prev) => prev,
    enabled: Boolean(connectorId) && (options?.enabled ?? true)
  });
};

export const useListHsmConnectorKeys = (
  connectorId: string | null | undefined,
  label: string,
  options?: Omit<UseQueryOptions<THsmConnectorKey[]>, "queryKey" | "queryFn">
) => {
  return useQuery({
    retry: false,
    ...options,
    queryKey: hsmConnectorKeys.keys(connectorId ?? "", label),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ keys: THsmConnectorKey[] }>(
        `/api/v1/cert-manager/hsm-connectors/${connectorId}/keys`,
        { params: { label } }
      );
      return data.keys;
    },
    enabled: Boolean(connectorId) && Boolean(label) && (options?.enabled ?? true)
  });
};
