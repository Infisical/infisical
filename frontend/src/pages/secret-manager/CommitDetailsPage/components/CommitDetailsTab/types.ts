export interface MergedItem {
  id: string;
  type: "secret" | "folder";
  versionId?: string;
  folderName?: string;
  folderVersion?: string;
  secretKey?: string;
  secretVersion?: string;
  isAdded?: boolean;
  isUpdated?: boolean;
  isDeleted?: boolean;
  versions?: any[];
  changeId: string;
}
