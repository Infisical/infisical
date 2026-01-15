import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2/enums";
import {
  TCreateSecretRotationV2DTO,
  TDeleteSecretRotationV2DTO,
  TReconcileUnixLinuxLocalAccountRotationDTO,
  TReconcileUnixLinuxLocalAccountRotationResponse,
  TRotateSecretRotationV2DTO,
  TSecretRotationV2Response,
  TUpdateSecretRotationV2DTO
} from "@app/hooks/api/secretRotationsV2/types";

export const useCreateSecretRotationV2 = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, ...params }: TCreateSecretRotationV2DTO) => {
      const { data } = await apiRequest.post<TSecretRotationV2Response>(
        `/api/v2/secret-rotations/${type}`,
        params
      );

      return data.secretRotation;
    },
    onSuccess: (_, { projectId, secretPath }) =>
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      })
  });
};

export const useUpdateSecretRotationV2 = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, rotationId, ...params }: TUpdateSecretRotationV2DTO) => {
      const { data } = await apiRequest.patch<TSecretRotationV2Response>(
        `/api/v2/secret-rotations/${type}/${rotationId}`,
        params
      );

      return data.secretRotation;
    },
    onSuccess: (_, { projectId, secretPath }) =>
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      })
  });
};

export const useRotateSecretRotationV2 = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, rotationId }: TRotateSecretRotationV2DTO) => {
      const { data } = await apiRequest.post<TSecretRotationV2Response>(
        `/api/v2/secret-rotations/${type}/${rotationId}/rotate-secrets`
      );

      return data.secretRotation;
    },
    onSuccess: (_, { projectId, secretPath }) =>
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      }),
    onError: (_, { projectId, secretPath }) =>
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      })
  });
};

export const useDeleteSecretRotationV2 = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      type,
      rotationId,
      deleteSecrets,
      revokeGeneratedCredentials
    }: TDeleteSecretRotationV2DTO) => {
      const { data } = await apiRequest.delete<TSecretRotationV2Response>(
        `/api/v2/secret-rotations/${type}/${rotationId}`,
        { params: { deleteSecrets, revokeGeneratedCredentials } }
      );

      return data.secretRotation;
    },
    onSuccess: (_, { projectId, secretPath }) =>
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      })
  });
};

export const useReconcileUnixLinuxLocalAccountRotation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rotationId }: TReconcileUnixLinuxLocalAccountRotationDTO) => {
      const { data } = await apiRequest.post<TReconcileUnixLinuxLocalAccountRotationResponse>(
        `/api/v2/secret-rotations/${SecretRotation.UnixLinuxLocalAccount}/${rotationId}/reconcile`
      );

      return data;
    },
    onSuccess: (_, { projectId, secretPath }) =>
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      }),
    onError: (_, { projectId, secretPath }) =>
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      })
  });
};
