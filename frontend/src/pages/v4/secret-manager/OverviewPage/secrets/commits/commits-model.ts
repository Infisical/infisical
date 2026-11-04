import type { Resource } from "../../secrets-model";

export type CommitResourceChange = {
  resourceType: "secret" | "folder";
  action: "create" | "update" | "delete";
  name: string;
  before?: Resource;
  after?: Resource;
};

export type CommitSummary = {
  secretCount: number;
  folderCount: number;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
};

export const summarizeChanges = (changes: readonly CommitResourceChange[]): CommitSummary =>
  changes.reduce(
    (acc, change) => {
      if (change.resourceType === "secret") acc.secretCount += 1;
      else acc.folderCount += 1;
      if (change.action === "create") acc.addedCount += 1;
      else if (change.action === "update") acc.updatedCount += 1;
      else acc.deletedCount += 1;
      return acc;
    },
    { secretCount: 0, folderCount: 0, addedCount: 0, updatedCount: 0, deletedCount: 0 }
  );
