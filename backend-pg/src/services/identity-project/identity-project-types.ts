import { TProjectPermission } from "@app/lib/types";

export type TCreateProjectIdentityDTO = {
  identityId: string;
  role: string;
} & TProjectPermission;

export type TUpdateProjectIdentityDTO = {
  role: string;
  identityId: string;
} & TProjectPermission;

export type TDeleteProjectIdentityDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListProjectIdentityDTO = TProjectPermission;
