import { OrderByDirection } from "@app/hooks/api/generic/types";

export enum SubOrgOrderBy {
  Name = "name"
}

export type TSubOrganization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  parentOrgId: string;
  // membership state, not an org column: only the list endpoint returns it, and it is null when
  // the caller has no membership in the sub-org
  isActive?: boolean | null;
};

export type TCreateSubOrganizationDTO = {
  name: string;
  slug?: string;
};

export type TListSubOrganizationsDTO = {
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: SubOrgOrderBy;
  orderDirection?: OrderByDirection;
  isAccessible?: boolean;
};

export type TUpdateSubOrganizationDTO = {
  subOrgId: string;
  name?: string;
  slug?: string;
};

export type TDeleteSubOrganizationDTO = {
  subOrgId: string;
};

export type TJoinSubOrganizationDTO = {
  subOrgId: string;
};
