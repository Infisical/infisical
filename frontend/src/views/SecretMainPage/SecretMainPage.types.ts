export type Filter = {
  tags: Record<string, boolean>;
  searchFilter: string;
};

export enum SortDir {
  ASC = "asc",
  DESC = "desc"
}

export enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "Secret"
}
