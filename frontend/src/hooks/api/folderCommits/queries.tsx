import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { apiRequest } from "@app/config/request";

import { Commit, CommitHistoryItem, CommitWithChanges, RollbackPreview } from "./types";

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
    envSlug,
    projectId,
    deepRollback
  }: {
    folderId: string;
    commitId: string;
    envSlug: string;
    projectId: string;
    deepRollback: boolean;
  }) => [{ folderId, commitId, envSlug, projectId, deepRollback }, "rollback-preview"] as const
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
    "/api/v1/pit/commits/count",
    {
      params: {
        environment,
        path: directory,
        projectId: workspaceId
      }
    }
  );
  return res.data;
};

const fetchFolderCommitHistory = async (
  workspaceId: string,
  environment: string,
  directory: string,
  offset: number = 0,
  limit: number = 20,
  search?: string,
  sort: "asc" | "desc" = "desc"
): Promise<{
  commits: CommitHistoryItem[];
  total: number;
  hasMore: boolean;
}> => {
  const res = await apiRequest.get<{
    commits: CommitHistoryItem[];
    total: number;
    hasMore: boolean;
  }>("/api/v1/pit/commits", {
    params: {
      environment,
      path: directory,
      projectId: workspaceId,
      offset,
      limit,
      search,
      sort
    }
  });
  return res.data;
};

export const fetchCommitDetails = async (workspaceId: string, commitId: string) => {
  const { data } = await apiRequest.get<CommitWithChanges>(
    `/api/v1/pit/commits/${commitId}/changes`,
    {
      params: {
        projectId: workspaceId
      }
    }
  );
  return data;
};

export const fetchRollbackPreview = async (
  folderId: string,
  commitId: string,
  envSlug: string,
  workspaceId: string,
  deepRollback: boolean,
  secretPath: string
): Promise<RollbackPreview[]> => {
  const { data } = await apiRequest.get<RollbackPreview[]>(
    `/api/v1/pit/commits/${commitId}/compare`,
    {
      params: {
        folderId,
        environment: envSlug,
        deepRollback,
        secretPath,
        projectId: workspaceId
      }
    }
  );
  return data;
};

const fetchRollback = async (
  folderId: string,
  commitId: string,
  workspaceId: string,
  deepRollback: boolean,
  message?: string,
  envSlug?: string
) => {
  const { data } = await apiRequest.post<{ success: boolean }>(
    `/api/v1/pit/commits/${commitId}/rollback`,
    {
      folderId,
      deepRollback,
      message,
      environment: envSlug,
      projectId: workspaceId
    }
  );
  return data;
};

const fetchRevert = async (commitId: string, workspaceId: string) => {
  const { data } = await apiRequest.post<{ success: boolean; message: string }>(
    `/api/v1/pit/commits/${commitId}/revert`,
    {
      projectId: workspaceId
    }
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
  envSlug
}: {
  workspaceId: string;
  commitId: string;
  folderId: string;
  deepRollback: boolean;
  environment: string;
  directory: string;
  envSlug: string;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      fetchRollback(folderId, commitId, workspaceId, deepRollback, message, envSlug),
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
  directory,
  limit = 20,
  search,
  sort = "desc"
}: {
  workspaceId: string;
  environment: string;
  directory: string;
  limit?: number;
  search?: string;
  sort?: "asc" | "desc";
}) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: [commitKeys.history({ workspaceId, environment, directory }), limit, search, sort],
    queryFn: ({ pageParam }) =>
      fetchFolderCommitHistory(workspaceId, environment, directory, pageParam, limit, search, sort),
    enabled: Boolean(workspaceId && environment),
    select: (data) => {
      return (data?.pages ?? [])
        ?.map((page) => page.commits)
        .flat()
        .reduce(
          (acc, commit) => {
            const date = format(new Date(commit.createdAt), "MMM d, yyyy");
            if (!acc[date]) {
              acc[date] = [];
            }
            acc[date].push(commit);
            return acc;
          },
          {} as Record<string, Commit[]>
        );
    },
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length * limit : undefined)
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
  envSlug: string,
  projectId: string,
  deepRollback: boolean,
  secretPath: string
) => {
  return useQuery({
    queryKey: commitKeys.rollbackPreview({ folderId, commitId, envSlug, projectId, deepRollback }),
    queryFn: () =>
      fetchRollbackPreview(folderId, commitId, envSlug, projectId, deepRollback, secretPath),
    enabled: Boolean(folderId) && Boolean(commitId)
  });
};
