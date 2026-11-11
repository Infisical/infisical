import { IPType } from "@app/lib/ip";
import { TSearchResourceOperator } from "@app/lib/search-resource/search";
import { OrderByDirection, TActorInput } from "@app/lib/types";

export type TCreateIdentityDTO = {
  role: string;
  name: string;
  hasDeleteProtection: boolean;
  metadata?: { key: string; value: string }[];
  orgId: string;
} & TActorInput;

export type TUpdateIdentityDTO = {
  id: string;
  role?: string;
  hasDeleteProtection?: boolean;
  name?: string;
  metadata?: { key: string; value: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TDeleteIdentityDTO = {
  id: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetIdentityByIdDTO = {
  id: string;
} & TActorInput;

export interface TIdentityTrustedIp {
  ipAddress: string;
  type: IPType;
  prefix: number;
}

export type TListProjectIdentitiesByIdentityIdDTO = {
  identityId: string;
} & TActorInput;

export type TListOrgIdentitiesByOrgIdDTO = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  orgId: string;
} & TActorInput;

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

export type TSearchOrgIdentitiesByOrgIdDTO = TSearchOrgIdentitiesByOrgIdDAL & TActorInput;
