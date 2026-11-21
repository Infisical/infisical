import {
  useCommitRevert,
  useCommitRollback,
  useGetCommitDetails,
  useGetFolderCommitHistory,
  useGetFolderCommitsCount,
  useGetRollbackPreview
} from "@app/hooks/api/folderCommits/queries";

import type { SecretsCommitsAdapter } from "./contract-commits";

export const secretsCommitsLive: SecretsCommitsAdapter = {
  useCommitCount: ({ enabled = true, ...dto }) => {
    const query = useGetFolderCommitsCount({ ...dto, isPaused: !enabled });
    return { data: query.data?.count, isPending: query.isPending, error: query.error };
  },
  useCommitHistory: ({ enabled = true, ...dto }) => {
    const query = useGetFolderCommitHistory({ ...dto, isPaused: !enabled });
    return {
      data: query.data && {
        commits: query.data.groups.flatMap((group) => group.commits),
        total: query.data.total
      },
      isPending: query.isPending,
      error: query.error,
      fetchNextPage: query.fetchNextPage,
      hasNextPage: query.hasNextPage
    };
  },
  useCommitDetails: useGetCommitDetails,
  useRollbackPreview: ({ projectId, folderId, commitId, deepRollback }) =>
    useGetRollbackPreview(folderId, commitId, projectId, deepRollback),
  useCommitRevert,
  useCommitRollback: (dto) => useCommitRollback({ ...dto, envSlug: dto.environment })
};
