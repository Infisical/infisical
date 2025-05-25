import { CommitType, SecretVersions } from "../types";

export type CommitHistoryItem = {
  id: string;
  commitId: string;
  actorMetadata: {
    id: string;
    name?: string;
  };
  actorType: string;
  message: string;
  folderId: string;
  envId: string;
  createdAt: string;
  updatedAt: string;
  isLatest: boolean;
};

export type TFolderCommitChanges = {
  id: string;
  folderCommitId: string;
  changeType: CommitType;
  isUpdate: boolean;
  secretVersionId: string | null;
  folderVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: SecretVersions[];
  secretKey?: string;
  folderName?: string;
  secretVersion?: string;
  folderVersion?: string;
};

export type FolderReconstructedItem = {
  type: string;
  id: string;
  versionId: string;
  folderName?: string;
  folderVersion?: number;
  secretKey?: string;
  secretVersion?: number;
};

export type CommitWithChanges = {
  changes: CommitHistoryItem & {
    changes: TFolderCommitChanges[];
  };
};

export type RollbackChange = {
  type: "folder" | "secret";
  id: string;
  versionId: string;
  changeType: "create" | "update" | "delete";
  commitId: string;
};

export type RollbackPreview = {
  folderId: string;
  folderName: string;
  folderPath: string;
  changes: RollbackChange[];
};
