import { ProjectMembershipRole, ProjectType } from "@app/db/schemas/models";
import { TOrgRolesUpdate } from "@app/db/schemas/org-roles";
import { TProjectRolesInsert } from "@app/db/schemas/project-roles";
import { TProjectPermission } from "@app/lib/types";

export enum ProjectRoleServiceIdentifierType {
  ID = "id",
  SLUG = "slug"
}

export type TCreateRoleDTO = {
  data: Omit<TProjectRolesInsert, "projectId">;
  filter:
    | { type: ProjectRoleServiceIdentifierType.SLUG; projectSlug: string }
    | { type: ProjectRoleServiceIdentifierType.ID; projectId: string };
} & Omit<TProjectPermission, "projectId">;

export type TGetRoleDetailsDTO = {
  roleSlug: string;
  filter:
    | { type: ProjectRoleServiceIdentifierType.SLUG; projectSlug: string }
    | { type: ProjectRoleServiceIdentifierType.ID; projectId: string };
} & Omit<TProjectPermission, "projectId">;

export type TUpdateRoleDTO = {
  roleId: string;
  data: Omit<TOrgRolesUpdate, "orgId">;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteRoleDTO = {
  roleId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListRolesDTO = {
  filter:
    | { type: ProjectRoleServiceIdentifierType.SLUG; projectSlug: string }
    | { type: ProjectRoleServiceIdentifierType.ID; projectId: string };
} & Omit<TProjectPermission, "projectId">;

export type TGetPredefinedRolesDTO = {
  projectId: string;
  projectType: ProjectType;
  roleFilter?: ProjectMembershipRole;
};
