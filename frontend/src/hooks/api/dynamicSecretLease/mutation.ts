import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { DynamicSecretProviders } from "../dynamicSecret/types";
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
    object,
    TCreateDynamicSecretLeaseDTO
  >({
    mutationFn: async (dto) => {
      if (dto.provider === DynamicSecretProviders.Kubernetes) {
        const { data } = await apiRequest.post<{ lease: TDynamicSecretLease; data: unknown }>(
          "/api/v1/dynamic-secrets/leases/kubernetes",
          dto
        );
        return data;
      }

      const { data } = await apiRequest.post<{ lease: TDynamicSecretLease; data: unknown }>(
        "/api/v1/dynamic-secrets/leases",
        dto
      );
      return data;
    },
    onSuccess: (_, { path, environmentSlug, projectSlug, dynamicSecretName }) => {
      queryClient.invalidateQueries({
        queryKey: dynamicSecretLeaseKeys.list({
          path,
          projectSlug,
          environmentSlug,
          dynamicSecretName
        })
      });
    }
  });
};

export const useRenewDynamicSecretLease = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TRenewDynamicSecretLeaseDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ lease: TDynamicSecretLease }>(
        `/api/v1/dynamic-secrets/leases/${dto.leaseId}/renew`,
        dto
      );
      return data.lease;
    },
    onSuccess: (_, { path, environmentSlug, projectSlug, dynamicSecretName }) => {
      queryClient.invalidateQueries({
        queryKey: dynamicSecretLeaseKeys.list({
          path,
          projectSlug,
          environmentSlug,
          dynamicSecretName
        })
      });
    }
  });
};

export const useRevokeDynamicSecretLease = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TRevokeDynamicSecretLeaseDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete<{ lease: TDynamicSecretLease }>(
        `/api/v1/dynamic-secrets/leases/${dto.leaseId}`,
        { data: dto }
      );
      return data.lease;
    },
    onSuccess: (_, { path, environmentSlug, projectSlug, dynamicSecretName }) => {
      queryClient.invalidateQueries({
        queryKey: dynamicSecretLeaseKeys.list({
          path,
          projectSlug,
          environmentSlug,
          dynamicSecretName
        })
      });
    }
  });
};
