export interface MergedItem {
  id: string;
  type: "secret" | "folder" | "import";
  versionId?: string;
  folderName?: string;
  folderVersion?: string;
  secretKey?: string;
  secretVersion?: string;
  importPath?: string;
  importPosition?: number;
  importVersion?: string;
  isAdded?: boolean;
  isUpdated?: boolean;
  isDeleted?: boolean;
  versions?: any[];
  changeId: string;
}
