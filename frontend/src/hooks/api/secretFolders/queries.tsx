/* eslint-disable no-param-reassign */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { secretSnapshotKeys } from '../secretSnapshots/queries';
import {
  FolderDTO,
  GetProjectFolderDTO,
  GetProjectSecretsDTO,
} from './types';

export const folderKeys = {
  // this is also used in secretSnapshot part
  getProjectFolder: (workspaceId: string, env: string | string[]) => [
    { workspaceId, env },
    'folders'
  ],
  // getSecretVersion: (secretId: string) => [{ secretId }, 'secret-versions']
};

const fetchProjectFolders = async (workspaceId: string, env: string | string[], secretsPath: string) => {
  if (typeof env === 'string') {
    const { data } = await apiRequest.get<{ folders: any[] }>('/api/v2/secrets', {
      params: {
        workspaceId,
        environment: env, 
        secretsPath: secretsPath || '/'
      }
    });
    console.log('folders here', data.folders)
    return data.folders;
  }

  if (typeof env === 'object') {
    let allEnvData: any = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const envPoint of env) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await apiRequest.get<{ folders: any[] }>('/api/v2/secrets', {
        params: {
          environment: envPoint,
          workspaceId, 
          secretsPath: secretsPath || '/'
        }
      });
      allEnvData = allEnvData.concat(data.folders);
    }
    console.log('folders here2', allEnvData)

    return allEnvData;
    // eslint-disable-next-line no-else-return
  } else {
    return null;
  }
};

export const useGetProjectFolders = ({
  workspaceId,
  env,
  secretsPath,
  decryptFileKey,
  isPaused
}: GetProjectSecretsDTO) =>
  useQuery({
    // wait for all values to be available
    enabled: Boolean(decryptFileKey && workspaceId && env) && !isPaused,
    queryKey: folderKeys.getProjectFolder(workspaceId, env),
    queryFn: () => fetchProjectFolders(workspaceId, env, secretsPath),
    select: (data) => {
      console.log('folders', data)
      return { folders: data };
    }
  });

const fetchProjectFolderById = async (folderId: string) => {
  const { data } = await apiRequest.get<{ folder: any[] }>(`/api/v1/folder/${folderId}`);
  return data.folder;
};


export const useGetProjectFolderById = ({
  folderId,
  workspaceId,
  env,
  isPaused
}: GetProjectFolderDTO) =>
  useQuery({
    // wait for all values to be available
    enabled: Boolean(folderId) && !isPaused,
    queryKey: folderKeys.getProjectFolder(workspaceId, env),
    queryFn: () => fetchProjectFolderById(folderId),
    select: (data) => {
      console.log(666777, data)
      return data;
    }
  });

export const useFolderOp = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, FolderDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post('/api/v1/folder/', dto);
      return data;
    },
    onSuccess: (_, dto) => {
      queryClient.invalidateQueries(folderKeys.getProjectFolder(dto.workspaceId, dto.environment));
      queryClient.invalidateQueries(secretSnapshotKeys.list(dto.workspaceId));
      queryClient.invalidateQueries(secretSnapshotKeys.count(dto.workspaceId));
    }
  });
};
