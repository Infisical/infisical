import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { dynamicSecretLeaseKeys } from "./queries";
import {
  TCreateDynamicSecretLeaseDTO,
  TDynamicSecretLease,
  TRenewDynamicSecretLeaseDTO,
  TRevokeDynamicSecretLeaseDTO
} from "./types";

export const useCreateDynamicSecretLease = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { lease: TDynamicSecretLease; data: unknown },
    {},
    TCreateDynamicSecretLeaseDTO
  >({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ lease: TDynamicSecretLease; data: unknown }>(
        "/api/v1/dynamic-secrets/leases",
        dto
      );
      return data;
    },
    onSuccess: (_, { path, environment, projectSlug, slug }) => {
      queryClient.invalidateQueries(
        dynamicSecretLeaseKeys.list({ path, projectSlug, environment, slug })
      );
    }
  });
};

export const useRenewDynamicSecretLease = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TRenewDynamicSecretLeaseDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ lease: TDynamicSecretLease }>(
        `/api/v1/dynamic-secrets/leases/${dto.leaseId}/renew`,
        dto
      );
      return data.lease;
    },
    onSuccess: (_, { path, environment, projectSlug, slug }) => {
      queryClient.invalidateQueries(
        dynamicSecretLeaseKeys.list({ path, projectSlug, environment, slug })
      );
    }
  });
};

export const useRevokeDynamicSecretLease = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TRevokeDynamicSecretLeaseDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete<{ lease: TDynamicSecretLease }>(
        `/api/v1/dynamic-secrets/leases/${dto.leaseId}`,
        { data: dto }
      );
      return data.lease;
    },
    onSuccess: (_, { path, environment, projectSlug, slug }) => {
      queryClient.invalidateQueries(
        dynamicSecretLeaseKeys.list({ path, projectSlug, environment, slug })
      );
    }
  });
};
