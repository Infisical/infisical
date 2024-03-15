import { TProjectPermission } from "@app/lib/types";

export enum ProjectUserAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TCreateUserPrivilegeDTO = (
  | {
      permissions: unknown;
      projectMembershipId: string;
      name: string;
      slug: string;
      description?: string;
      isTemporary: false;
    }
  | {
      permissions: unknown;
      projectMembershipId: string;
      name: string;
      slug: string;
      description?: string;
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
    name: string;
    slug: string;
    description?: string;
    isTemporary: boolean;
    temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative;
    temporaryRange: string;
    temporaryAccessStartTime: string;
  }>;

export type TDeleteUserPrivilegeDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };

export type TGetUserPrivilegeDetailsDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };
