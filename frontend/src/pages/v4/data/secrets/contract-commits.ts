import type {
  Commit,
  CommitWithChanges,
  RollbackPreview
} from "@app/hooks/api/folderCommits/types";

import type { V4QueryResult } from "../contract";

type FolderScope = { projectId: string; environment: string; directory: string };

export type SecretsCommitsAdapter = {
  useCommitCount: (dto: FolderScope & { enabled?: boolean }) => V4QueryResult<number>;
  useCommitHistory: (
    dto: FolderScope & { search?: string; sort?: "asc" | "desc"; enabled?: boolean }
  ) => V4QueryResult<{ commits: Commit[]; total: number }> & {
    fetchNextPage: () => unknown;
    hasNextPage: boolean;
  };
  useCommitDetails: (projectId: string, commitId: string) => V4QueryResult<CommitWithChanges>;
  useRollbackPreview: (dto: {
    projectId: string;
    folderId: string;
    commitId: string;
    deepRollback: boolean;
  }) => V4QueryResult<RollbackPreview[]>;
  useCommitRevert: (dto: FolderScope & { commitId: string }) => {
    mutateAsync: () => Promise<unknown>;
    isPending: boolean;
  };
  useCommitRollback: (
    dto: FolderScope & { commitId: string; folderId: string; deepRollback: boolean }
  ) => {
    mutateAsync: (message: string) => Promise<unknown>;
    isPending: boolean;
  };
};
