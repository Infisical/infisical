import { OrgServiceActor } from "@app/lib/types";

export type TCreateSubOrgDTO = {
  name: string;
  slug?: string;
  permissionActor: OrgServiceActor;
};

export type TListSubOrgDTO = {
  permissionActor: OrgServiceActor;
  data: Partial<{
    limit?: number;
    offset?: number;
    search?: string;
    isAccessible?: boolean;
  }>;
};

export type TUpdateSubOrgDTO = {
  subOrgId: string;
  name?: string;
  slug?: string;
  permissionActor: OrgServiceActor;
};
