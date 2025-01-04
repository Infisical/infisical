export type Filter = {
  tags: Record<string, boolean>;
  searchFilter: string;
  include: {
    [key in RowType]: boolean;
  };
};

export enum RowType {
  Folder = "folder",
  Import = "import",
  DynamicSecret = "dynamic",
  Secret = "secret"
}
