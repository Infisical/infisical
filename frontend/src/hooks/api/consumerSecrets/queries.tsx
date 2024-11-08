import { useQuery, UseQueryOptions } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';
import {
  ConsumerSecretOrderBy,
  TListProjectConsumerSecretsDTO,
  TProjectConsumerSecretsList,
} from '@app/hooks/api/consumerSecrets/types';
import { OrderByDirection } from '@app/hooks/api/generic/types';

export const consumerSecretKeys = {
  all: ['consumerSecret'] as const,
  lists: () => [...consumerSecretKeys.all, 'list'] as const,
  getConsumerSecretsByProjectId: ({
    projectId,
    ...filters
  }: TListProjectConsumerSecretsDTO) =>
    [...consumerSecretKeys.lists(), projectId, filters] as const,
};

export const useGetConsumerSecretsByProjectId = (
  {
    projectId,
    offset = 0,
    limit = 100,
    orderBy = ConsumerSecretOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = '',
  }: TListProjectConsumerSecretsDTO,
  options?: Omit<
    UseQueryOptions<
      TProjectConsumerSecretsList,
      unknown,
      TProjectConsumerSecretsList,
      ReturnType<typeof consumerSecretKeys.getConsumerSecretsByProjectId>
    >,
    'queryKey' | 'queryFn'
  >,
) => {
  return useQuery({
    queryKey: consumerSecretKeys.getConsumerSecretsByProjectId({
      projectId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search,
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectConsumerSecretsList>(
        '/api/v1/kms/keys',
        {
          params: { projectId, offset, limit, search, orderBy, orderDirection },
        },
      );

      return data;
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    keepPreviousData: true,
    ...options,
  });
};
