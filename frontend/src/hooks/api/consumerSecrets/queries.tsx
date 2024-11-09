import { useQuery, UseQueryOptions } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';
import {
  TProjectSecretNotesList,
  TListProjectSecretNotesDTO,
  SecretNoteOrderBy,
} from '@app/hooks/api/consumerSecrets/types';
import { OrderByDirection } from '@app/hooks/api/generic/types';

export const consumerSecretKeys = {
  all: ['consumerSecret'] as const,
  lists: () => [...consumerSecretKeys.all, 'list'] as const,
  getConsumerSecretsByProjectId: ({
    projectId,
    ...filters
  }: TListProjectSecretNotesDTO) =>
    [...consumerSecretKeys.lists(), projectId, filters] as const,
};

export const useGetSecretNotesByProjectId = (
  {
    projectId,
    offset = 0,
    limit = 100,
    orderBy = SecretNoteOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = '',
  }: TListProjectSecretNotesDTO,
  options?: Omit<
    UseQueryOptions<
      TProjectSecretNotesList,
      unknown,
      TProjectSecretNotesList,
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
      const { data } = await apiRequest.get<TProjectSecretNotesList>(
        '/api/v1/csms/secret-notes',
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
