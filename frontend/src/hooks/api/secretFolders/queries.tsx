import { useCallback, useMemo } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  UseQueryOptions
} from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretSnapshotKeys } from "../secretSnapshots/queries";
import {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TGetFoldersByEnvDTO,
  TGetProjectFoldersDTO,
  TSecretFolder,
  TUpdateFolderDTO
} from "./types";

const queryKeys = {
  getSecretFolders: ({ workspaceId, environment, directory }: TGetProjectFoldersDTO) =>
    ["secret-folders", { workspaceId, environment, directory }] as const
};

const fetchProjectFolders = async (workspaceId: string, environment: string, directory = "/") => {
  const { data } = await apiRequest.get<{ folders: TSecretFolder[] }>("/api/v1/folders", {
    params: {
      workspaceId,
      environment,
      directory
    }
  });
  return data.folders;
};

export const useGetProjectFolders = ({
  workspaceId,
  environment,
  directory = "/",
  options = {}
}: TGetProjectFoldersDTO & {
  options?: Omit<
    UseQueryOptions<
      TSecretFolder[],
      unknown,
      TSecretFolder[],
      ReturnType<typeof queryKeys.getSecretFolders>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: queryKeys.getSecretFolders({ workspaceId, environment, directory }),
    enabled: Boolean(workspaceId) && Boolean(environment) && (options?.enabled ?? true),
    queryFn: async () => fetchProjectFolders(workspaceId, environment, directory)
  });

export const useGetFoldersByEnv = ({
  directory = "/",
  workspaceId,
  environments
}: TGetFoldersByEnvDTO) => {
  const folders = useQueries({
    queries: environments.map((environment) => ({
      queryKey: queryKeys.getSecretFolders({ workspaceId, environment, directory }),
      queryFn: async () => fetchProjectFolders(workspaceId, environment, directory),
      enabled: Boolean(workspaceId) && Boolean(environment)
    }))
  });

  const folderNames = useMemo(() => {
    const names = new Set<string>();
    folders?.forEach(({ data }) => {
      data?.forEach(({ name }) => {
        names.add(name);
      });
    });
    return [...names];
  }, [(folders || []).map((folder) => folder.data)]);

  const isFolderPresentInEnv = useCallback(
    (name: string, env: string) => {
      const selectedEnvIndex = environments.indexOf(env);
      if (selectedEnvIndex !== -1) {
        return Boolean(
          folders?.[selectedEnvIndex]?.data?.find(({ name: folderName }) => folderName === name)
        );
      }
      return false;
    },
    [(folders || []).map((folder) => folder.data)]
  );

  return { folders, folderNames, isFolderPresentInEnv };
};

export const useCreateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateFolderDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/folders", dto);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, directory }) => {
      queryClient.invalidateQueries(
        queryKeys.getSecretFolders({ workspaceId, environment, directory })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ workspaceId, environment, directory })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ workspaceId, environment, directory })
      );
    }
  });
};

export const useUpdateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateFolderDTO>({
    mutationFn: async ({ directory = "/", folderName, name, environment, workspaceId }) => {
      const { data } = await apiRequest.patch(`/api/v1/folders/${folderName}`, {
        name,
        environment,
        workspaceId,
        directory
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, directory }) => {
      queryClient.invalidateQueries(
        queryKeys.getSecretFolders({ workspaceId, environment, directory })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ workspaceId, environment, directory })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ workspaceId, environment, directory })
      );
    }
  });
};

export const useDeleteFolder = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteFolderDTO>({
    mutationFn: async ({ directory = "/", folderName, environment, workspaceId }) => {
      const { data } = await apiRequest.delete(`/api/v1/folders/${folderName}`, {
        data: {
          environment,
          workspaceId,
          directory
        }
      });
      return data;
    },
    onSuccess: (_, { directory = "/", workspaceId, environment }) => {
      queryClient.invalidateQueries(
        queryKeys.getSecretFolders({ workspaceId, environment, directory })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ workspaceId, environment, directory })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ workspaceId, environment, directory })
      );
    }
  });
};
