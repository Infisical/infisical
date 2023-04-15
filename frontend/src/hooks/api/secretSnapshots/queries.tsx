/* eslint-disable no-param-reassign */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decryptAssymmetric,
  decryptSymmetric
} from '@app/components/utilities/cryptography/crypto';
import { apiRequest } from '@app/config/request';

import { DecryptedSecret } from '../secrets/types';
import {
  GetWorkspaceSecretSnapshotsDTO,
  TSecretRollbackDTO,
  TSnapshotSecret,
  TSnapshotSecretProps,
  TWorkspaceSecretSnapshot
} from './types';

export const secretSnapshotKeys = {
  list: (workspaceId: string) => [{ workspaceId }, 'secret-snapshot'] as const,
  snapshotSecrets: (snapshotId: string) => [{ snapshotId }, 'secret-snapshot'] as const,
  count: (workspaceId: string) => [{ workspaceId }, 'count', 'secret-snapshot']
};

const fetchWorkspaceSecretSnaphots = async (workspaceId: string, limit = 10, offset = 0) => {
  const res = await apiRequest.get<{ secretSnapshots: TWorkspaceSecretSnapshot[] }>(
    `/api/v1/workspace/${workspaceId}/secret-snapshots`,
    {
      params: {
        limit,
        offset
      }
    }
  );

  return res.data.secretSnapshots;
};

export const useGetWorkspaceSecretSnapshots = (dto: GetWorkspaceSecretSnapshotsDTO) =>
  useInfiniteQuery({
    enabled: Boolean(dto.workspaceId),
    queryKey: secretSnapshotKeys.list(dto.workspaceId),
    queryFn: ({ pageParam }) => fetchWorkspaceSecretSnaphots(dto.workspaceId, dto.limit, pageParam),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * dto.limit : undefined
  });

const fetchSnapshotEncSecrets = async (snapshotId: string) => {
  const res = await apiRequest.get<{ secretSnapshot: TSnapshotSecret }>(
    `/api/v1/secret-snapshot/${snapshotId}`
  );
  return res.data.secretSnapshot;
};

export const useGetSnapshotSecrets = ({ decryptFileKey, env, snapshotId }: TSnapshotSecretProps) =>
  useQuery({
    queryKey: secretSnapshotKeys.snapshotSecrets(snapshotId),
    enabled: Boolean(snapshotId && decryptFileKey),
    queryFn: () => fetchSnapshotEncSecrets(snapshotId),
    select: (data) => {
      const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY') as string;
      const latestKey = decryptFileKey;
      const key = decryptAssymmetric({
        ciphertext: latestKey.encryptedKey,
        nonce: latestKey.nonce,
        publicKey: latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      const sharedSecrets: DecryptedSecret[] = [];
      const personalSecrets: Record<string, { id: string; value: string }> = {};
      data.secretVersions
        .filter(({ environment }) => environment === env)
        .forEach((encSecret) => {
          const secretKey = decryptSymmetric({
            ciphertext: encSecret.secretKeyCiphertext,
            iv: encSecret.secretKeyIV,
            tag: encSecret.secretKeyTag,
            key
          });

          const secretValue = decryptSymmetric({
            ciphertext: encSecret.secretValueCiphertext,
            iv: encSecret.secretValueIV,
            tag: encSecret.secretValueTag,
            key
          });

          const secretComment = '';

          const decryptedSecret = {
            _id: encSecret.secret,
            env: encSecret.environment,
            key: secretKey,
            value: secretValue,
            tags: encSecret.tags,
            comment: secretComment,
            createdAt: encSecret.createdAt,
            updatedAt: encSecret.updatedAt,
            type: 'modified'
          };

          if (encSecret.type === 'personal') {
            personalSecrets[decryptedSecret.key] = { id: encSecret.secret, value: secretValue };
          } else {
            sharedSecrets.push(decryptedSecret);
          }
        });

      sharedSecrets.forEach((val) => {
        if (personalSecrets?.[val.key]) {
          val.idOverride = personalSecrets[val.key].id;
          val.valueOverride = personalSecrets[val.key].value;
          val.overrideAction = 'modified';
        }
      });

      return { version: data.version, secrets: sharedSecrets, createdAt: data.createdAt };
    }
  });

const fetchWorkspaceSecretSnaphotCount = async (workspaceId: string) => {
  const res = await apiRequest.get<{ count: number }>(
    `/api/v1/workspace/${workspaceId}/secret-snapshots/count`
  );
  return res.data.count;
};

export const useGetWsSnapshotCount = (workspaceId: string) =>
  useQuery({
    enabled: Boolean(workspaceId),
    queryKey: secretSnapshotKeys.count(workspaceId),
    queryFn: () => fetchWorkspaceSecretSnaphotCount(workspaceId)
  });

export const usePerformSecretRollback = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TSecretRollbackDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post(
        `/api/v1/workspace/${dto.workspaceId}/secret-snapshots/rollback`,
        {
          version: dto.version
        }
      );
      return data;
    },
    onSuccess: (_, dto) => {
      queryClient.invalidateQueries(secretSnapshotKeys.list(dto.workspaceId));
      queryClient.invalidateQueries(secretSnapshotKeys.count(dto.workspaceId));
    }
  });
};
