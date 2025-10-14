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
  namespaceId: string;
  name?: string;
  description?: string;
};

export type TDeleteNamespaceDTO = {
  namespaceId: string;
};

export type TGetNamespaceDTO = {
  namespaceId: string;
};

export type TListNamespacesDTO = {
  offset?: number;
  limit?: number;
  search?: string;
  orderBy?: SearchNamespaceSortBy;
  orderDirection?: "asc" | "desc";
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
