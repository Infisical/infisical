import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetPublicKeyResponse,
  TListSignersDTO,
  TListSignersResponse,
  TListSigningOperationsDTO,
  TListSigningOperationsResponse,
  TSigner
} from "./types";

export const signerKeys = {
  all: ["signers"] as const,
  list: (projectId: string) => [...signerKeys.all, "list", projectId] as const,
  listWithOpts: (filters: TListSignersDTO) => [...signerKeys.list(filters.projectId), filters] as const,
  byId: (signerId: string) => [...signerKeys.all, "detail", signerId] as const,
  publicKey: (signerId: string) => [...signerKeys.all, "publicKey", signerId] as const,
  operations: (signerId: string) => [...signerKeys.all, "operations", signerId] as const,
  operationsWithOpts: (filters: TListSigningOperationsDTO) =>
    [...signerKeys.operations(filters.signerId), filters] as const
};

export const useListSigners = (dto: TListSignersDTO) => {
  return useQuery({
    queryKey: signerKeys.listWithOpts(dto),
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId: dto.projectId,
        offset: String(dto.offset ?? 0),
        limit: String(dto.limit ?? 25)
      });
      if (dto.search) params.set("search", dto.search);

      const { data } = await apiRequest.get<TListSignersResponse>(
        `/api/v1/cert-manager/signers?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(dto.projectId),
    placeholderData: (previousData) => previousData
  });
};

export const useGetSigner = (signerId: string) => {
  return useQuery({
    queryKey: signerKeys.byId(signerId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSigner>(
        `/api/v1/cert-manager/signers/${signerId}`
      );
      return data;
    },
    enabled: Boolean(signerId)
  });
};

export const useGetSignerPublicKey = (signerId: string) => {
  return useQuery({
    queryKey: signerKeys.publicKey(signerId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetPublicKeyResponse>(
        `/api/v1/cert-manager/signers/${signerId}/public-key`
      );
      return data;
    },
    enabled: Boolean(signerId)
  });
};

export const useListSigningOperations = (dto: TListSigningOperationsDTO) => {
  return useQuery({
    queryKey: signerKeys.operationsWithOpts(dto),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(dto.offset ?? 0),
        limit: String(dto.limit ?? 25)
      });
      if (dto.status) params.set("status", dto.status);

      const { data } = await apiRequest.get<TListSigningOperationsResponse>(
        `/api/v1/cert-manager/signers/${dto.signerId}/operations?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(dto.signerId),
    placeholderData: (previousData) => previousData
  });
};
