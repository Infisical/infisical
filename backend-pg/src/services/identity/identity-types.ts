import { TOrgPermission } from "@app/lib/types";

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
