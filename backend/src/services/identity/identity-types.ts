import { IPType } from "@app/lib/ip";
import { OrderByDirection, TOrgPermission } from "@app/lib/types";

export type TCreateIdentityDTO = {
  role: string;
  name: string;
} & TOrgPermission;

export type TUpdateIdentityDTO = {
  id: string;
  role?: string;
  name?: string;
} & Omit<TOrgPermission, "orgId">;

export type TDeleteIdentityDTO = {
  id: string;
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
  direction?: OrderByDirection;
  textFilter?: string;
} & TOrgPermission;

export enum OrgIdentityOrderBy {
  Name = "name",
  Role = "role"
}
