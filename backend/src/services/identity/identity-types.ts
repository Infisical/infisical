import { IPType } from "@app/lib/ip";
import { TOrgPermission } from "@app/lib/types";

export type TCreateIdentityDTO = {
  role: string;
  name: string;
} & TOrgPermission;

export type TUpdateIdentityDTO = {
  id: string;
  role?: string;
  name?: string;
  isDisabled?: boolean;
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
