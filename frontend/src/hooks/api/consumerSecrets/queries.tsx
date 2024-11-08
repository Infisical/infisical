import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { ConsumerSecrets, ConsumerSecretsListEntry } from './types';

export const consumerSecretsKeys = {
  getExternalConsumerSecretsList: (orgId: string) => [
    'get-all-external-consumerSecrets',
    { orgId },
  ],
  getExternalConsumerSecretsById: (id: string) => [
    'get-external-consumerSecrets',
    { id },
  ],
  getActiveProjectConsumerSecrets: (projectId: string) => [
    'get-active-project-consumerSecrets',
    { projectId },
  ],
};

export const useGetExternalConsumerSecretsList = (
  orgId: string,
  { enabled }: { enabled?: boolean } = {},
) => {
  return useQuery({
    queryKey: consumerSecretsKeys.getExternalConsumerSecretsList(orgId),
    enabled,
    queryFn: async () => {
      const {
        data: { externalConsumerSecretsList },
      } = await apiRequest.get<{
        externalConsumerSecretsList: ConsumerSecretsListEntry[];
      }>('/api/v1/external-consumerSecrets');
      return externalConsumerSecretsList;
    },
  });
};

export const useGetExternalConsumerSecretsById = (
  consumerSecretsId: string,
) => {
  return useQuery({
    queryKey:
      consumerSecretsKeys.getExternalConsumerSecretsById(consumerSecretsId),
    enabled: Boolean(consumerSecretsId),
    queryFn: async () => {
      const {
        data: { externalConsumerSecrets },
      } = await apiRequest.get<{ externalConsumerSecrets: ConsumerSecrets }>(
        `/api/v1/external-consumerSecrets/${consumerSecretsId}`,
      );
      return externalConsumerSecrets;
    },
  });
};

export const useGetActiveProjectConsumerSecrets = (projectId: string) => {
  return useQuery({
    queryKey: consumerSecretsKeys.getActiveProjectConsumerSecrets(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const {
        data: { secretManagerConsumerSecretsKey },
      } = await apiRequest.get<{
        secretManagerConsumerSecretsKey: {
          id: string;
          name: string;
          isExternal: string;
        };
      }>(`/api/v1/workspace/${projectId}/consumerSecrets`);
      return secretManagerConsumerSecretsKey;
    },
  });
};

export const fetchProjectConsumerSecretsBackup = async (projectId: string) => {
  const { data } = await apiRequest.get<{
    secretManager: string;
  }>(`/api/v1/workspace/${projectId}/consumerSecrets/backup`);

  return data;
};
