export type Filter = {
  tags: Record<string, boolean>;
  searchFilter: string;
  groupBy?: GroupBy | null;
};

export enum SortDir {
  ASC = "asc",
  DESC = "desc"
}

export enum GroupBy {
  PREFIX = "prefix"
}
