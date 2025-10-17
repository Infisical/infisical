import { SortDirection } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

export type TCreateNamespaceDTO = {
  permission: OrgServiceActor;
  name: string;
  description?: string;
};

export type TUpdateNamespaceDTO = {
  permission: OrgServiceActor;
  namespaceId: string;
  name?: string;
  description?: string;
};

export type TDeleteNamespaceDTO = {
  permission: OrgServiceActor;
  namespaceId: string;
};

export type TListNamespaceDTO = {
  permission: OrgServiceActor;
  offset?: number;
  limit?: number;
  search?: string;
  orderBy?: SearchNamespaceSortBy;
  orderDirection?: SortDirection;
};

export type TGetByNameNamespaceDTO = {
  permission: OrgServiceActor;
  name: string;
};

export type TGetByIdNamespaceDTO = {
  permission: OrgServiceActor;
  namespaceId: string;
};

export enum SearchNamespaceSortBy {
  NAME = "name"
}

export type TSearchNamespaceDTO = {
  permission: OrgServiceActor;
  name?: string;
  limit?: number;
  offset?: number;
  orderBy?: SearchNamespaceSortBy;
  orderDirection?: SortDirection;
  namespaceIds?: string[];
};
