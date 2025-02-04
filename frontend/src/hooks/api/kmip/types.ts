import { OrderByDirection } from "../generic/types";

export enum KmipPermission {
  Create = "create",
  Locate = "locate",
  Check = "check",
  Get = "get"
}

export type TKmipClient = {
  id: string;
  name: string;
  description?: string;
  permissions: KmipPermission[];
  projectId: string;
};

type ProjectRef = { projectId: string };
type KeyRef = { id: string };

export type TCreateKmipClient = Pick<TKmipClient, "name" | "description" | "permissions"> &
  ProjectRef;

export type TUpdateKmipClient = KeyRef &
  Partial<Pick<TKmipClient, "name" | "description" | "permissions">> &
  ProjectRef;

export type TProjectKmipClientList = {
  kmipClients: TKmipClient[];
  totalCount: number;
};

export type TDeleteKmipClient = KeyRef & ProjectRef;

export type TListProjectKmipClientsDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: KmipClientOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export enum KmipClientOrderBy {
  Name = "name"
}
