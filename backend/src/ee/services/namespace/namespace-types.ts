import { OrgServiceActor } from "@app/lib/types";

export type TCreateNamespaceDTO = {
  permission: OrgServiceActor;
  name: string;
  description?: string;
};

export type TUpdateNamespaceDTO = {
  permission: OrgServiceActor;
  name: string;
  newName?: string;
  description?: string;
};

export type TDeleteNamespaceDTO = {
  permission: OrgServiceActor;
  name: string;
};

export type TListNamespaceDTO = {
  permission: OrgServiceActor;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TGetByNameNamespaceDTO = {
  permission: OrgServiceActor;
  name: string;
};
