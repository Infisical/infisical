export type TNamespace = {
  id: string;
  name: string;
  description?: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateNamespaceDTO = {
  name: string;
  description?: string;
};

export type TUpdateNamespaceDTO = {
  name: string;
  newName?: string;
  description?: string;
};

export type TDeleteNamespaceDTO = {
  name: string;
};

export type TGetNamespaceDTO = {
  name: string;
};

export type TListNamespacesDTO = {
  offset?: number;
  limit?: number;
  search?: string;
};

export enum SearchNamespaceSortBy {
  NAME = "name"
}

export type TSearchNamespacesDTO = {
  name?: string;
  limit?: number;
  offset?: number;
  orderBy?: SearchNamespaceSortBy;
  orderDirection?: "asc" | "desc";
  namespaceIds?: string[];
};
