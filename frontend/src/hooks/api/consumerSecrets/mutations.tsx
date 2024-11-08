import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { consumerSecretsKeys } from './queries';
import { AddExternalConsumerSecretsType, ConsumerSecretsType } from './types';

export const useAddExternalConsumerSecrets = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      description,
      provider,
    }: AddExternalConsumerSecretsType) => {
      const { data } = await apiRequest.post(
        '/api/v1/external-consumerSecrets',
        {
          name,
          description,
          provider,
        },
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(
        consumerSecretsKeys.getExternalConsumerSecretsList(orgId),
      );
    },
  });
};

export const useUpdateExternalConsumerSecrets = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      consumerSecretsId,
      name,
      description,
      provider,
    }: {
      consumerSecretsId: string;
    } & AddExternalConsumerSecretsType) => {
      const { data } = await apiRequest.patch(
        `/api/v1/external-consumerSecrets/${consumerSecretsId}`,
        {
          name,
          description,
          provider,
        },
      );

      return data;
    },
    onSuccess: (_, { consumerSecretsId }) => {
      queryClient.invalidateQueries(
        consumerSecretsKeys.getExternalConsumerSecretsList(orgId),
      );
      queryClient.invalidateQueries(
        consumerSecretsKeys.getExternalConsumerSecretsById(consumerSecretsId),
      );
    },
  });
};

export const useRemoveExternalConsumerSecrets = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (consumerSecretsId: string) => {
      const { data } = await apiRequest.delete(
        `/api/v1/external-consumerSecrets/${consumerSecretsId}`,
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(
        consumerSecretsKeys.getExternalConsumerSecretsList(orgId),
      );
    },
  });
};

export const useUpdateProjectConsumerSecrets = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      updatedData:
        | { type: ConsumerSecretsType.Internal }
        | { type: ConsumerSecretsType.External; consumerSecretsId: string },
    ) => {
      const { data } = await apiRequest.patch(
        `/api/v1/workspace/${projectId}/consumerSecrets`,
        {
          consumerSecrets: updatedData,
        },
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(
        consumerSecretsKeys.getActiveProjectConsumerSecrets(projectId),
      );
    },
  });
};

export const useLoadProjectConsumerSecretsBackup = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (backup: string) => {
      const { data } = await apiRequest.post(
        `/api/v1/workspace/${projectId}/consumerSecrets/backup`,
        {
          backup,
        },
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(
        consumerSecretsKeys.getActiveProjectConsumerSecrets(projectId),
      );
    },
  });
};
