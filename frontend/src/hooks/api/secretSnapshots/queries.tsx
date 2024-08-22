/* eslint-disable no-param-reassign */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SecretType, SecretV3RawSanitized } from "../secrets/types";
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
        path: directory
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

export const useGetSnapshotSecrets = ({ snapshotId }: TSnapshotDataProps) =>
  useQuery({
    queryKey: secretSnapshotKeys.snapshotData(snapshotId),
    enabled: Boolean(snapshotId),
    queryFn: () => fetchSnapshotEncSecrets(snapshotId),
    select: (data) => {
      const sharedSecrets: SecretV3RawSanitized[] = [];
      const personalSecrets: Record<string, { id: string; value: string }> = {};
      data.secretVersions.forEach((secretVersion) => {
        const decryptedSecret = {
          id: secretVersion.secretId,
          env: data.environment.slug,
          key: secretVersion.secretKey,
          value: secretVersion.secretValue || "",
          tags: secretVersion.tags,
          comment: secretVersion.secretComment,
          createdAt: secretVersion.createdAt,
          updatedAt: secretVersion.updatedAt,
          type: "modified",
          version: secretVersion.version
        };

        if (secretVersion.type === SecretType.Personal) {
          personalSecrets[decryptedSecret.key] = {
            id: secretVersion.secretId,
            value: secretVersion.secretValue || ""
          };
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
        id: data.id,
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
        path: directory
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
    mutationFn: async ({ snapshotId }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-snapshot/${snapshotId}/rollback`);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, directory }) => {
      queryClient.invalidateQueries([
        { workspaceId, environment, secretPath: directory },
        "secrets"
      ]);
      queryClient.invalidateQueries([
        "secret-folders",
        { projectId: workspaceId, environment, path: directory }
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
