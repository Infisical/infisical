import { AccessScope } from "@app/db/schemas";
import { IPType } from "@app/lib/ip";
import { TSearchResourceOperator } from "@app/lib/search-resource/search";
import { OrderByDirection, TOrgPermission } from "@app/lib/types";

export type TCreateIdentityDTO = {
  role: string;
  name: string;
  hasDeleteProtection: boolean;
  metadata?: { key: string; value: string }[];
} & TOrgPermission;

export type TUpdateIdentityDTO = {
  id: string;
  role?: string;
  hasDeleteProtection?: boolean;
  name?: string;
  metadata?: { key: string; value: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TOrgPermission, "orgId">;

export type TDeleteIdentityDTO = {
  id: string;
  isActorSuperAdmin?: boolean;
} & Omit<TOrgPermission, "orgId">;

export type TGetIdentityByIdDTO = {
  id: string;
} & Omit<TOrgPermission, "orgId">;

export interface TIdentityTrustedIp {
  ipAddress: string;
  type: IPType;
  prefix: number;
}

export type TListProjectIdentitiesByIdentityIdDTO = {
  identityId: string;
} & Omit<TOrgPermission, "orgId">;

export type TListOrgIdentitiesByOrgIdDTO = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
} & TOrgPermission;

export enum OrgIdentityOrderBy {
  Name = "name",
  Role = "role"
}

export type TSearchOrgIdentitiesByOrgIdDAL = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  orgId: string;
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

export type TSearchOrgIdentitiesByOrgIdDTO = TSearchOrgIdentitiesByOrgIdDAL & TOrgPermission;

export enum SearchIdentitiesScope {
  Organization = "organization",
  Project = "project"
}

// Translate a raw `Membership.scope` value into a SearchIdentitiesScope. The two enums share
// string values today but live in separate files — go through this helper so a future drift
// (extra AccessScope variant, renamed value) surfaces here instead of silently mistyping rows.
export const accessScopeToSearchIdentitiesScope = (scope: string): SearchIdentitiesScope => {
  switch (scope) {
    case AccessScope.Organization:
      return SearchIdentitiesScope.Organization;
    case AccessScope.Project:
      return SearchIdentitiesScope.Project;
    default:
      throw new Error(`Unexpected membership scope for identity search: ${scope}`);
  }
};

export type TSearchIdentitiesV2DAL = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  orgId: string;
  scope: SearchIdentitiesScope[];
  accessibleProjectIds: string[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

export type TSearchIdentitiesV2DTO = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  scope: SearchIdentitiesScope[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
} & TOrgPermission;

export type TCountIdentitiesV2DAL = {
  orgId: string;
  scope: SearchIdentitiesScope[];
  accessibleProjectIds: string[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

export type TCountIdentitiesV2DTO = {
  scope: SearchIdentitiesScope[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
} & TOrgPermission;
