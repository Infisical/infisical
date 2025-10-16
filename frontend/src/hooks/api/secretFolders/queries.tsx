import { useCallback, useMemo } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  UseQueryOptions
} from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import { commitKeys } from "../folderCommits/queries";
import { secretSnapshotKeys } from "../secretSnapshots/queries";
import {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TGetFoldersByEnvDTO,
  TGetProjectFoldersDTO,
  TProjectEnvironmentsFolders,
  TSecretFolder,
  TUpdateFolderBatchDTO,
  TUpdateFolderDTO
} from "./types";

export const folderQueryKeys = {
  getSecretFolders: ({ projectId, environment, path }: TGetProjectFoldersDTO) =>
    ["secret-folders", { projectId, environment, path }] as const,
  getProjectEnvironmentsFolders: (projectId: string) =>
    ["secret-folders", "environment", projectId] as const
};

const fetchProjectFolders = async (projectId: string, environment: string, path = "/") => {
  const { data } = await apiRequest.get<{ folders: TSecretFolder[] }>("/api/v2/folders", {
    params: {
      projectId,
      environment,
      path
    }
  });
  return data.folders;
};

export const useListProjectEnvironmentsFolders = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TProjectEnvironmentsFolders,
      unknown,
      TProjectEnvironmentsFolders,
      ReturnType<typeof folderQueryKeys.getProjectEnvironmentsFolders>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: folderQueryKeys.getProjectEnvironmentsFolders(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectEnvironmentsFolders>(
        `/api/v1/projects/${projectId}/environment-folder-tree`
      );
      return data;
    },
    ...options
  });

export const useGetProjectFolders = ({
  projectId,
  environment,
  path = "/",
  options = {}
}: TGetProjectFoldersDTO & {
  options?: Omit<
    UseQueryOptions<
      TSecretFolder[],
      unknown,
      TSecretFolder[],
      ReturnType<typeof folderQueryKeys.getSecretFolders>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: folderQueryKeys.getSecretFolders({ projectId, environment, path }),
    enabled: Boolean(projectId) && Boolean(environment) && (options?.enabled ?? true),
    queryFn: async () => fetchProjectFolders(projectId, environment, path)
  });

export const useGetFoldersByEnv = ({
  path = "/",
  projectId,
  environments
}: TGetFoldersByEnvDTO) => {
  const folders = useQueries({
    queries: environments.map((environment) => ({
      queryKey: folderQueryKeys.getSecretFolders({ projectId, environment, path }),
      queryFn: async () => fetchProjectFolders(projectId, environment, path),
      enabled: Boolean(projectId) && Boolean(environment)
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
  }, [...(folders || []).map((folder) => folder.data)]);

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
    [...(folders || []).map((folder) => folder.data)]
  );

  const getFolderByNameAndEnv = useCallback(
    (name: string, env: string) => {
      const selectedEnvIndex = environments.indexOf(env);
      if (selectedEnvIndex !== -1) {
        return folders?.[selectedEnvIndex]?.data?.find(
          ({ name: folderName }) => folderName === name
        );
      }

      return undefined;
    },
    [(folders || []).map((folder) => folder.data)]
  );

  return { folders, folderNames, isFolderPresentInEnv, getFolderByNameAndEnv };
};

export const useCreateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateFolderDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v2/folders", {
        ...dto,
        projectId: dto.projectId
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, path }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath: path ?? "/"
        })
      });
      queryClient.invalidateQueries({
        queryKey: folderQueryKeys.getSecretFolders({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: path })
      });
    }
  });
};

export const useUpdateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateFolderDTO>({
    mutationFn: async ({ path = "/", folderId, name, environment, projectId, description }) => {
      const { data } = await apiRequest.patch(`/api/v2/folders/${folderId}`, {
        name,
        environment,
        projectId,
        path,
        description
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, path }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath: path ?? "/"
        })
      });
      queryClient.invalidateQueries({
        queryKey: folderQueryKeys.getSecretFolders({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: path })
      });
    }
  });
};

export const useDeleteFolder = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteFolderDTO>({
    mutationFn: async ({ path = "/", folderId, environment, projectId }) => {
      const { data } = await apiRequest.delete(`/api/v2/folders/${folderId}`, {
        data: {
          environment,
          projectId,
          path
        }
      });
      return data;
    },
    onSuccess: (_, { path = "/", projectId, environment }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath: path
        })
      });
      queryClient.invalidateQueries({
        queryKey: folderQueryKeys.getSecretFolders({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: path })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: path })
      });
    }
  });
};

export const useUpdateFolderBatch = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateFolderBatchDTO>({
    mutationFn: async ({ projectId, folders }) => {
      const { data } = await apiRequest.patch("/api/v2/folders/batch", {
        projectId,
        folders
      });

      return data;
    },
    onSuccess: (_, { projectId, folders }) => {
      folders.forEach((folder) => {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.getDashboardSecrets({
            projectId,
            secretPath: folder.path ?? "/"
          })
        });
        queryClient.invalidateQueries({
          queryKey: folderQueryKeys.getSecretFolders({
            projectId,
            environment: folder.environment,
            path: folder.path
          })
        });
        queryClient.invalidateQueries({
          queryKey: secretSnapshotKeys.list({
            projectId,
            environment: folder.environment,
            directory: folder.path
          })
        });
        queryClient.invalidateQueries({
          queryKey: secretSnapshotKeys.count({
            projectId,
            environment: folder.environment,
            directory: folder.path
          })
        });
        queryClient.invalidateQueries({
          queryKey: commitKeys.count({
            projectId,
            environment: folder.environment,
            directory: folder.path
          })
        });
        queryClient.invalidateQueries({
          queryKey: commitKeys.history({
            projectId,
            environment: folder.environment,
            directory: folder.path
          })
        });
      });
    }
  });
};
