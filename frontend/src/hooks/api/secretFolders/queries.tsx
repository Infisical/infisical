import { useCallback } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretSnapshotKeys } from "../secretSnapshots/queries";
import {
  CreateFolderDTO,
  DeleteFolderDTO,
  GetProjectFoldersBatchDTO,
  GetProjectFoldersDTO,
  TSecretFolder,
  UpdateFolderDTO
} from "./types";

const queryKeys = {
  getSecretFolders: (workspaceId: string, environment: string, parentFolderId?: string) =>
    ["secret-folders", { workspaceId, environment, parentFolderId }] as const
};

const fetchProjectFolders = async (
  workspaceId: string,
  environment: string,
  parentFolderId?: string,
  parentFolderPath?: string
) => {
  const { data } = await apiRequest.get<{ folders: TSecretFolder[]; dir: TSecretFolder[] }>(
    "/api/v1/folders",
    {
      params: {
        workspaceId,
        environment,
        parentFolderId,
        parentFolderPath
      }
    }
  );
  return data;
};

export const useGetProjectFolders = ({
  workspaceId,
  parentFolderId,
  environment,
  isPaused,
  sortDir
}: GetProjectFoldersDTO) =>
  useQuery({
    queryKey: queryKeys.getSecretFolders(workspaceId, environment, parentFolderId),
    enabled: Boolean(workspaceId) && Boolean(environment) && !isPaused,
    queryFn: async () => fetchProjectFolders(workspaceId, environment, parentFolderId),
    select: useCallback(
      ({ folders, dir }: { folders: TSecretFolder[]; dir: TSecretFolder[] }) => ({
        dir,
        folders: folders.sort((a, b) =>
          sortDir === "asc"
            ? a?.name?.localeCompare(b?.name || "")
            : b?.name?.localeCompare(a?.name || "")
        )
      }),
      [sortDir]
    )
  });

export const useGetProjectFoldersBatch = ({
  folders = [],
  isPaused,
  parentFolderPath
}: GetProjectFoldersBatchDTO) =>
  useQueries({
    queries: folders.map(({ workspaceId, environment, parentFolderId }) => ({
      queryKey: queryKeys.getSecretFolders(workspaceId, environment, parentFolderPath),
      queryFn: async () =>
        fetchProjectFolders(workspaceId, environment, parentFolderId, parentFolderPath),
      enabled: Boolean(workspaceId) && Boolean(environment) && !isPaused,
      select: (data: { folders: TSecretFolder[]; dir: TSecretFolder[] }) => ({
        environment,
        folders: data.folders,
        dir: data.dir
      })
    }))
  });

export const useCreateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, CreateFolderDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/folders", dto);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, parentFolderId }) => {
      queryClient.invalidateQueries(
        queryKeys.getSecretFolders(workspaceId, environment, parentFolderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count(workspaceId, environment, parentFolderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list(workspaceId, environment, parentFolderId)
      );
    }
  });
};

export const useUpdateFolder = (parentFolderId: string) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateFolderDTO>({
    mutationFn: async ({ folderId, name, environment, workspaceId }) => {
      const { data } = await apiRequest.patch(`/api/v1/folders/${folderId}`, {
        name,
        environment,
        workspaceId
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment }) => {
      queryClient.invalidateQueries(
        queryKeys.getSecretFolders(workspaceId, environment, parentFolderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count(workspaceId, environment, parentFolderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list(workspaceId, environment, parentFolderId)
      );
    }
  });
};

export const useDeleteFolder = (parentFolderId: string) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeleteFolderDTO>({
    mutationFn: async ({ folderId, environment, workspaceId }) => {
      const { data } = await apiRequest.delete(`/api/v1/folders/${folderId}`, {
        data: {
          environment,
          workspaceId
        }
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment }) => {
      queryClient.invalidateQueries(
        queryKeys.getSecretFolders(workspaceId, environment, parentFolderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count(workspaceId, environment, parentFolderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list(workspaceId, environment, parentFolderId)
      );
    }
  });
};
