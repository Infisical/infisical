import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@app/config/request';
import { consumerSecretKeys } from '@app/hooks/api/consumerSecrets/queries';
import {
  TCreateSecretNote,
  TUpdateSecretNote,
  TDeleteSecretNote,
} from '@app/hooks/api/consumerSecrets/types';

export const useCreateSecretNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TCreateSecretNote) => {
      const { data } = await apiRequest.post(
        '/api/v1/csms/secret-notes',
        payload,
      );

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(
        consumerSecretKeys.getConsumerSecretsByProjectId({ projectId }),
      );
    },
  });
};

export const useUpdateSecretNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, name, content }: TUpdateSecretNote) => {
      const { data } = await apiRequest.patch(
        `/api/v1/csms/secret-notes/${noteId}`,
        {
          name,
          content,
        },
      );

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(
        consumerSecretKeys.getConsumerSecretsByProjectId({ projectId }),
      );
    },
  });
};

export const useDeleteSecretNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId }: TDeleteSecretNote) => {
      const { data } = await apiRequest.delete(
        `/api/v1/csms/secret-notes/${noteId}`,
      );

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(
        consumerSecretKeys.getConsumerSecretsByProjectId({ projectId }),
      );
    },
  });
};
