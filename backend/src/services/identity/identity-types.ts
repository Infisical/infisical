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
  Name = "name"
  // Role = "role"
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
