import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { CommitHistoryItem, CommitWithChanges, RollbackPreview } from "./types";

export const commitKeys = {
  count: ({
    workspaceId,
    environment,
    directory
  }: {
    workspaceId: string;
    environment: string;
    directory?: string;
  }) => [{ workspaceId, environment, directory }, "folder-commits-count"] as const,

  history: ({
    workspaceId,
    environment,
    directory
  }: {
    workspaceId: string;
    environment: string;
    directory?: string;
  }) => [{ workspaceId, environment, directory }, "folder-commits"] as const,

  details: ({ workspaceId, commitId }: { workspaceId: string; commitId: string }) =>
    [{ workspaceId, commitId }, "commit-details"] as const,

  rollbackPreview: ({
    folderId,
    commitId,
    envId,
    projectId,
    deepRollback
  }: {
    folderId: string;
    commitId: string;
    envId: string;
    projectId: string;
    deepRollback: boolean;
  }) => [{ folderId, commitId, envId, projectId, deepRollback }, "rollback-preview"] as const
};

const fetchFolderCommitsCount = async ({
  workspaceId,
  environment,
  directory
}: {
  workspaceId: string;
  environment: string;
  directory?: string;
}) => {
  const res = await apiRequest.get<{ count: number; folderId: string }>(
    `/api/v1/pit/commits/count/${workspaceId}`,
    {
      params: {
        environment,
        path: directory
      }
    }
  );
  return res.data;
};

const fetchFolderCommitHistory = async (
  workspaceId: string,
  environment: string,
  directory: string
): Promise<CommitHistoryItem[]> => {
  const res = await apiRequest.get<CommitHistoryItem[]>(`/api/v1/pit/commits/${workspaceId}`, {
    params: {
      environment,
      path: directory
    }
  });
  return res.data;
};

export const fetchCommitDetails = async (workspaceId: string, commitId: string) => {
  const { data } = await apiRequest.get<CommitWithChanges>(
    `/api/v1/pit/commits/${workspaceId}/${commitId}/changes`
  );
  return data;
};

export const fetchRollbackPreview = async (
  folderId: string,
  commitId: string,
  envId: string,
  projectId: string,
  deepRollback: boolean,
  secretPath: string
): Promise<RollbackPreview[]> => {
  const { data } = await apiRequest.get<RollbackPreview[]>(
    `/api/v1/pit/commits/${projectId}/${commitId}/compare`,
    {
      params: {
        folderId,
        envId,
        deepRollback,
        secretPath
      }
    }
  );
  return data;
};

const fetchRollback = async (
  folderId: string,
  commitId: string,
  projectId: string,
  deepRollback: boolean,
  message?: string,
  envId?: string
) => {
  const { data } = await apiRequest.post<{ success: boolean }>(
    `/api/v1/pit/commits/${projectId}/${commitId}/rollback`,
    {
      folderId,
      deepRollback,
      message,
      envId
    }
  );
  return data;
};

const fetchRevert = async (commitId: string, projectId: string) => {
  const { data } = await apiRequest.post<{ success: boolean; message: string }>(
    `/api/v1/pit/commits/${projectId}/${commitId}/revert`
  );
  return data;
};

export const useCommitRevert = ({
  commitId,
  projectId,
  environment,
  directory
}: {
  commitId: string;
  projectId: string;
  environment: string;
  directory: string;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchRevert(commitId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          commitKeys.details({ workspaceId: projectId, commitId }),
          commitKeys.history({ workspaceId: projectId, environment, directory }),
          commitKeys.count({ workspaceId: projectId, environment, directory })
        ]
      });
    }
  });
};

export const useCommitRollback = ({
  workspaceId,
  commitId,
  folderId,
  deepRollback,
  environment,
  directory,
  envId
}: {
  workspaceId: string;
  commitId: string;
  folderId: string;
  deepRollback: boolean;
  environment: string;
  directory: string;
  envId: string;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      fetchRollback(folderId, commitId, workspaceId, deepRollback, message, envId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          commitKeys.details({ workspaceId, commitId }),
          commitKeys.history({ workspaceId, environment, directory }),
          commitKeys.count({ workspaceId, environment, directory })
        ]
      });
    }
  });
};

export const useGetFolderCommitsCount = ({
  workspaceId,
  environment,
  directory,
  isPaused
}: {
  workspaceId: string;
  environment: string;
  directory: string;
  isPaused?: boolean;
}) =>
  useQuery({
    enabled: Boolean(workspaceId && environment) && !isPaused,
    queryKey: commitKeys.count({ workspaceId, environment, directory }),
    queryFn: () => fetchFolderCommitsCount({ workspaceId, environment, directory })
  });

export const useGetFolderCommitHistory = ({
  workspaceId,
  environment,
  directory
}: {
  workspaceId: string;
  environment: string;
  directory: string;
}) => {
  return useQuery({
    queryKey: commitKeys.history({ workspaceId, environment, directory }),
    queryFn: () => fetchFolderCommitHistory(workspaceId, environment, directory),
    enabled: Boolean(workspaceId && environment)
  });
};

export const useGetCommitDetails = (workspaceId: string, commitId: string) => {
  return useQuery({
    queryKey: commitKeys.details({ workspaceId, commitId }),
    queryFn: () => fetchCommitDetails(workspaceId, commitId),
    enabled: Boolean(workspaceId) && Boolean(commitId)
  });
};

export const useGetRollbackPreview = (
  folderId: string,
  commitId: string,
  envId: string,
  projectId: string,
  deepRollback: boolean,
  secretPath: string
) => {
  return useQuery({
    queryKey: commitKeys.rollbackPreview({ folderId, commitId, envId, projectId, deepRollback }),
    queryFn: () =>
      fetchRollbackPreview(folderId, commitId, envId, projectId, deepRollback, secretPath),
    enabled: Boolean(folderId) && Boolean(commitId)
  });
};
