import { TFolderCommitChangeCount } from "./folder-commit-dal";
import { CommitType } from "./folder-commit-service";

export type TFolderCommitChangeSummary = {
  secretCount: number;
  folderCount: number;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
};

export const summarizeCommitChanges = (changeCounts: TFolderCommitChangeCount[]): TFolderCommitChangeSummary => {
  const summary: TFolderCommitChangeSummary = {
    secretCount: 0,
    folderCount: 0,
    addedCount: 0,
    updatedCount: 0,
    deletedCount: 0
  };

  for (const count of changeCounts) {
    summary.secretCount += count.secretCount;
    summary.folderCount += count.folderCount;

    if (count.changeType === CommitType.DELETE) {
      summary.deletedCount += count.totalCount;
    } else if (count.isUpdate) {
      summary.updatedCount += count.totalCount;
    } else {
      summary.addedCount += count.totalCount;
    }
  }

  return summary;
};
