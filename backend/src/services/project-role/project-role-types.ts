import { TOrgRolesUpdate, TProjectRolesInsert } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TCreateRoleDTO = {
  data: Omit<TProjectRolesInsert, "projectId">;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetRoleBySlugDTO = {
  roleSlug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateRoleDTO = {
  roleId: string;
  data: Omit<TOrgRolesUpdate, "orgId">;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteRoleDTO = {
  roleId: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TListRolesDTO = {
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;
