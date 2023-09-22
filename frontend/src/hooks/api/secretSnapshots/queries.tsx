/* eslint-disable no-param-reassign */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { DecryptedSecret } from "../secrets/types";
import {
  TGetSecretSnapshotsDTO,
  TSecretRollbackDTO,
  TSecretSnapshot,
  TSnapshotData,
  TSnapshotDataProps
} from "./types";

export const secretSnapshotKeys = {
  list: ({ workspaceId, environment, directory }: Omit<TGetSecretSnapshotsDTO, "limit">) =>
    [{ workspaceId, environment, directory }, "secret-snapshot"] as const,
  snapshotData: (snapshotId: string) => [{ snapshotId }, "secret-snapshot"] as const,
  count: ({ environment, workspaceId, directory }: Omit<TGetSecretSnapshotsDTO, "limit">) => [
    { workspaceId, environment, directory },
    "count",
    "secret-snapshot"
  ]
};

const fetchWorkspaceSnaphots = async ({
  workspaceId,
  environment,
  directory = "/",
  limit = 10,
  offset = 0
}: TGetSecretSnapshotsDTO & { offset: number }) => {
  const res = await apiRequest.get<{ secretSnapshots: TSecretSnapshot[] }>(
    `/api/v1/workspace/${workspaceId}/secret-snapshots`,
    {
      params: {
        limit,
        offset,
        environment,
        directory
      }
    }
  );

  return res.data.secretSnapshots;
};

export const useGetWorkspaceSnapshotList = (dto: TGetSecretSnapshotsDTO & { isPaused?: boolean }) =>
  useInfiniteQuery({
    enabled: Boolean(dto.workspaceId && dto.environment) && !dto.isPaused,
    queryKey: secretSnapshotKeys.list({ ...dto }),
    queryFn: ({ pageParam }) => fetchWorkspaceSnaphots({ ...dto, offset: pageParam }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * dto.limit : undefined
  });

const fetchSnapshotEncSecrets = async (snapshotId: string) => {
  const res = await apiRequest.get<{ secretSnapshot: TSnapshotData }>(
    `/api/v1/secret-snapshot/${snapshotId}`
  );
  return res.data.secretSnapshot;
};

export const useGetSnapshotSecrets = ({ decryptFileKey, env, snapshotId }: TSnapshotDataProps) =>
  useQuery({
    queryKey: secretSnapshotKeys.snapshotData(snapshotId),
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
            type: "modified",
            version: encSecret.version
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
  directory = "/"
) => {
  const res = await apiRequest.get<{ count: number }>(
    `/api/v1/workspace/${workspaceId}/secret-snapshots/count`,
    {
      params: {
        environment,
        directory
      }
    }
  );
  return res.data.count;
};

export const useGetWsSnapshotCount = ({
  workspaceId,
  environment,
  directory,
  isPaused
}: Omit<TGetSecretSnapshotsDTO, "limit"> & { isPaused?: boolean }) =>
  useQuery({
    enabled: Boolean(workspaceId && environment) && !isPaused,
    queryKey: secretSnapshotKeys.count({ workspaceId, environment, directory }),
    queryFn: () => fetchWorkspaceSecretSnaphotCount(workspaceId, environment, directory)
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
    onSuccess: (_, { workspaceId, environment, directory }) => {
      queryClient.invalidateQueries([
        { workspaceId, environment, secretPath: directory },
        "secrets"
      ]);
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ workspaceId, environment, directory })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ workspaceId, environment, directory })
      );
    }
  });
};
