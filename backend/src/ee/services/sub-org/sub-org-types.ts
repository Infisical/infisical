import { OrgServiceActor } from "@app/lib/types";

export type TCreateSubOrgDTO = {
  name: string;
  slug?: string;
  permission: OrgServiceActor;
};

export type TListSubOrgDTO = {
  permission: OrgServiceActor;
  data: Partial<{
    limit?: number;
    offset?: number;
    search?: string;
    orderBy?: string;
    orderDirection?: "asc" | "desc";
    isAccessible?: boolean;
  }>;
};

export type TUpdateSubOrgDTO = {
  subOrgId: string;
  name?: string;
  slug?: string;
  permission: OrgServiceActor;
};

export type TDeleteSubOrgDTO = {
  subOrgId: string;
  permission: OrgServiceActor;
};

export type TJoinSubOrgDTO = {
  subOrgId: string;
  permission: OrgServiceActor;
};
