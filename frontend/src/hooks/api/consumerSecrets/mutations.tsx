import { useMutation, useQueryClient } from '@tanstack/react-query';
import { encodeBase64 } from 'tweetnacl-util';

import { apiRequest } from '@app/config/request';
import { consumerSecretKeys } from '@app/hooks/api/consumerSecrets/queries';
import {
  TConsumerSecretDecrypt,
  TConsumerSecretDecryptResponse,
  TConsumerSecretEncrypt,
  TConsumerSecretEncryptResponse,
  TCreateConsumerSecret,
  TDeleteConsumerSecret,
  TUpdateConsumerSecret,
} from '@app/hooks/api/consumerSecrets/types';

export const useCreateConsumerSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TCreateConsumerSecret) => {
      const { data } = await apiRequest.post('/api/v1/kms/keys', payload);

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(
        consumerSecretKeys.getConsumerSecretsByProjectId({ projectId }),
      );
    },
  });
};

export const useUpdateConsumerSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      keyId,
      name,
      description,
      isDisabled,
    }: TUpdateConsumerSecret) => {
      const { data } = await apiRequest.patch(`/api/v1/kms/keys/${keyId}`, {
        name,
        description,
        isDisabled,
      });

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(
        consumerSecretKeys.getConsumerSecretsByProjectId({ projectId }),
      );
    },
  });
};

export const useDeleteConsumerSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keyId }: TDeleteConsumerSecret) => {
      const { data } = await apiRequest.delete(`/api/v1/kms/keys/${keyId}`);

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(
        consumerSecretKeys.getConsumerSecretsByProjectId({ projectId }),
      );
    },
  });
};

export const useConsumerSecretEncrypt = () => {
  return useMutation({
    mutationFn: async ({
      keyId,
      plaintext,
      isBase64Encoded,
    }: TConsumerSecretEncrypt) => {
      const { data } = await apiRequest.post<TConsumerSecretEncryptResponse>(
        `/api/v1/kms/keys/${keyId}/encrypt`,
        {
          plaintext: isBase64Encoded
            ? plaintext
            : encodeBase64(Buffer.from(plaintext)),
        },
      );

      return data;
    },
  });
};

export const useConsumerSecretDecrypt = () => {
  return useMutation({
    mutationFn: async ({ keyId, ciphertext }: TConsumerSecretDecrypt) => {
      const { data } = await apiRequest.post<TConsumerSecretDecryptResponse>(
        `/api/v1/kms/keys/${keyId}/decrypt`,
        {
          ciphertext,
        },
      );

      return data;
    },
  });
};
