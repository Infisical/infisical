import { TProjectPermission } from "@app/lib/types";

export enum ProjectUserAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TCreateUserPrivilegeDTO = (
  | {
      permissions: unknown;
      projectMembershipId: string;
      slug: string;
      isTemporary: false;
    }
  | {
      permissions: unknown;
      projectMembershipId: string;
      slug: string;
      isTemporary: true;
      temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    }
) &
  Omit<TProjectPermission, "projectId">;

export type TUpdateUserPrivilegeDTO = { privilegeId: string } & Omit<TProjectPermission, "projectId"> &
  Partial<{
    permissions: unknown;
    slug: string;
    isTemporary: boolean;
    temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative;
    temporaryRange: string;
    temporaryAccessStartTime: string;
  }>;

export type TDeleteUserPrivilegeDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };

export type TGetUserPrivilegeDetailsDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };

export type TListUserPrivilegesDTO = Omit<TProjectPermission, "projectId"> & { projectMembershipId: string };
