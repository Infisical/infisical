/* eslint-disable no-param-reassign */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { DecryptedSecret } from "../secrets/types";
import {
  GetWorkspaceSecretSnapshotsDTO,
  TSecretRollbackDTO,
  TSnapshotSecret,
  TSnapshotSecretProps,
  TWorkspaceSecretSnapshot
} from "./types";

export const secretSnapshotKeys = {
  list: (workspaceId: string, env: string, folderId?: string) =>
    [{ workspaceId, env, folderId }, "secret-snapshot"] as const,
  snapshotSecrets: (snapshotId: string) => [{ snapshotId }, "secret-snapshot"] as const,
  count: (workspaceId: string, env: string, folderId?: string) => [
    { workspaceId, env, folderId },
    "count",
    "secret-snapshot"
  ]
};

const fetchWorkspaceSecretSnaphots = async (
  workspaceId: string,
  environment: string,
  folderId?: string,
  limit = 10,
  offset = 0
) => {
  const res = await apiRequest.get<{ secretSnapshots: TWorkspaceSecretSnapshot[] }>(
    `/api/v1/workspace/${workspaceId}/secret-snapshots`,
    {
      params: {
        limit,
        offset,
        environment,
        folderId
      }
    }
  );

  return res.data.secretSnapshots;
};

export const useGetWorkspaceSecretSnapshots = (dto: GetWorkspaceSecretSnapshotsDTO) =>
  useInfiniteQuery({
    enabled: Boolean(dto.workspaceId && dto.environment),
    queryKey: secretSnapshotKeys.list(dto.workspaceId, dto.environment, dto?.folder),
    queryFn: ({ pageParam }) =>
      fetchWorkspaceSecretSnaphots(
        dto.workspaceId,
        dto.environment,
        dto?.folder,
        dto.limit,
        pageParam
      ),
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
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
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

          const secretComment = "";

          const decryptedSecret = {
            _id: encSecret.secret,
            env: encSecret.environment,
            key: secretKey,
            value: secretValue,
            tags: encSecret.tags,
            comment: secretComment,
            createdAt: encSecret.createdAt,
            updatedAt: encSecret.updatedAt,
            type: "modified"
          };

          if (encSecret.type === "personal") {
            personalSecrets[decryptedSecret.key] = { id: encSecret.secret, value: secretValue };
          } else {
            sharedSecrets.push(decryptedSecret);
          }
        });

      sharedSecrets.forEach((val) => {
        if (personalSecrets?.[val.key]) {
          val.idOverride = personalSecrets[val.key].id;
          val.valueOverride = personalSecrets[val.key].value;
          val.overrideAction = "modified";
        }
      });

      return {
        version: data.version,
        secrets: sharedSecrets,
        createdAt: data.createdAt,
        folders: data.folderVersion
      };
    }
  });

const fetchWorkspaceSecretSnaphotCount = async (
  workspaceId: string,
  environment: string,
  folderId?: string
) => {
  const res = await apiRequest.get<{ count: number }>(
    `/api/v1/workspace/${workspaceId}/secret-snapshots/count`,
    {
      params: {
        environment,
        folderId
      }
    }
  );
  return res.data.count;
};

export const useGetWsSnapshotCount = (workspaceId: string, env: string, folderId?: string) =>
  useQuery({
    enabled: Boolean(workspaceId && env),
    queryKey: secretSnapshotKeys.count(workspaceId, env, folderId),
    queryFn: () => fetchWorkspaceSecretSnaphotCount(workspaceId, env, folderId)
  });

export const usePerformSecretRollback = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TSecretRollbackDTO>({
    mutationFn: async ({ workspaceId, ...dto }) => {
      const { data } = await apiRequest.post(
        `/api/v1/workspace/${workspaceId}/secret-snapshots/rollback`,
        dto
      );
      return data;
    },
    onSuccess: (_, { workspaceId, environment, folderId }) => {
      queryClient.invalidateQueries([{ workspaceId, environment }, "secrets"]);
      queryClient.invalidateQueries(secretSnapshotKeys.list(workspaceId, environment, folderId));
      queryClient.invalidateQueries(secretSnapshotKeys.count(workspaceId, environment, folderId));
    }
  });
};
