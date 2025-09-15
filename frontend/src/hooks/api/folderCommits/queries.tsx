import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { apiRequest } from "@app/config/request";

import { Commit, CommitHistoryItem, CommitWithChanges, RollbackPreview } from "./types";

export const commitKeys = {
  count: ({
    projectId,
    environment,
    directory
  }: {
    projectId: string;
    environment: string;
    directory?: string;
  }) => [{ projectId, environment, directory }, "folder-commits-count"] as const,

  history: ({
    projectId,
    environment,
    directory
  }: {
    projectId: string;
    environment: string;
    directory?: string;
  }) => [{ projectId, environment, directory }, "folder-commits"] as const,

  details: ({ projectId, commitId }: { projectId: string; commitId: string }) =>
    [{ projectId, commitId }, "commit-details"] as const,

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
  projectId,
  environment,
  directory
}: {
  projectId: string;
  environment: string;
  directory?: string;
}) => {
  const res = await apiRequest.get<{ count: number; folderId: string }>(
    "/api/v1/pit/commits/count",
    {
      params: {
        environment,
        path: directory,
        projectId
      }
    }
  );
  return res.data;
};

const fetchFolderCommitHistory = async (
  projectId: string,
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
      projectId,
      offset,
      limit,
      search,
      sort
    }
  });
  return res.data;
};

export const fetchCommitDetails = async (projectId: string, commitId: string) => {
  const { data } = await apiRequest.get<CommitWithChanges>(
    `/api/v1/pit/commits/${commitId}/changes`,
    {
      params: {
        projectId
      }
    }
  );
  return data;
};

export const fetchRollbackPreview = async (
  folderId: string,
  commitId: string,
  envSlug: string,
  projectId: string,
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
        projectId
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
  envSlug?: string
) => {
  const { data } = await apiRequest.post<{ success: boolean }>(
    `/api/v1/pit/commits/${commitId}/rollback`,
    {
      folderId,
      deepRollback,
      message,
      environment: envSlug,
      projectId
    }
  );
  return data;
};

const fetchRevert = async (commitId: string, projectId: string) => {
  const { data } = await apiRequest.post<{ success: boolean; message: string }>(
    `/api/v1/pit/commits/${commitId}/revert`,
    {
      projectId
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
          commitKeys.details({ projectId, commitId }),
          commitKeys.history({ projectId, environment, directory }),
          commitKeys.count({ projectId, environment, directory })
        ]
      });
    }
  });
};

export const useCommitRollback = ({
  projectId,
  commitId,
  folderId,
  deepRollback,
  environment,
  directory,
  envSlug
}: {
  projectId: string;
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
      fetchRollback(folderId, commitId, projectId, deepRollback, message, envSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          commitKeys.details({ projectId, commitId }),
          commitKeys.history({ projectId, environment, directory }),
          commitKeys.count({ projectId, environment, directory })
        ]
      });
    }
  });
};

export const useGetFolderCommitsCount = ({
  projectId,
  environment,
  directory,
  isPaused
}: {
  projectId: string;
  environment: string;
  directory: string;
  isPaused?: boolean;
}) =>
  useQuery({
    enabled: Boolean(projectId && environment) && !isPaused,
    queryKey: commitKeys.count({ projectId, environment, directory }),
    queryFn: () => fetchFolderCommitsCount({ projectId, environment, directory })
  });

export const useGetFolderCommitHistory = ({
  projectId,
  environment,
  directory,
  limit = 20,
  search,
  sort = "desc"
}: {
  projectId: string;
  environment: string;
  directory: string;
  limit?: number;
  search?: string;
  sort?: "asc" | "desc";
}) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: [commitKeys.history({ projectId, environment, directory }), limit, search, sort],
    queryFn: ({ pageParam }) =>
      fetchFolderCommitHistory(projectId, environment, directory, pageParam, limit, search, sort),
    enabled: Boolean(projectId && environment),
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

export const useGetCommitDetails = (projectId: string, commitId: string) => {
  return useQuery({
    queryKey: commitKeys.details({ projectId, commitId }),
    queryFn: () => fetchCommitDetails(projectId, commitId),
    enabled: Boolean(projectId) && Boolean(commitId)
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
