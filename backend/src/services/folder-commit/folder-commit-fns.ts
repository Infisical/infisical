import { TFolderCommitChanges } from "@app/db/schemas";

import { CommitType } from "./folder-commit-service";

export type TFolderCommitChangeSummary = {
  secretCount: number;
  folderCount: number;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
};

export const summarizeCommitChanges = (changes: TFolderCommitChanges[]): TFolderCommitChangeSummary => {
  const summary: TFolderCommitChangeSummary = {
    secretCount: 0,
    folderCount: 0,
    addedCount: 0,
    updatedCount: 0,
    deletedCount: 0
  };

  for (const change of changes) {
    if (change.secretVersionId) summary.secretCount += 1;
    if (change.folderVersionId) summary.folderCount += 1;

    if (change.changeType === CommitType.DELETE) {
      summary.deletedCount += 1;
    } else if (change.isUpdate) {
      summary.updatedCount += 1;
    } else {
      summary.addedCount += 1;
    }
  }

  return summary;
};
