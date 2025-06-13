import { TProjectUserAdditionalPrivilege } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

import { TProjectPermissionV2Schema } from "../permission/project-permission";

export enum ProjectUserAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TCreateUserPrivilegeDTO = (
  | {
      permissions: TProjectPermissionV2Schema[];
      projectMembershipId: string;
      slug: string;
      isTemporary: false;
    }
  | {
      permissions: TProjectPermissionV2Schema[];
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
    permissions: TProjectPermissionV2Schema[];
    slug: string;
    isTemporary: boolean;
    temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative;
    temporaryRange: string;
    temporaryAccessStartTime: string;
  }>;

export type TDeleteUserPrivilegeDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };

export type TGetUserPrivilegeDetailsDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };

export type TListUserPrivilegesDTO = Omit<TProjectPermission, "projectId"> & { projectMembershipId: string };

interface TAdditionalPrivilege extends TProjectUserAdditionalPrivilege {
  permissions: {
    action: string[];
    subject?: string | undefined;
    conditions?: unknown;
    inverted?: boolean | undefined;
  }[];
}

export type TProjectUserAdditionalPrivilegeServiceFactory = {
  create: (arg: TCreateUserPrivilegeDTO) => Promise<TAdditionalPrivilege>;
  updateById: (arg: TUpdateUserPrivilegeDTO) => Promise<TAdditionalPrivilege>;
  deleteById: (arg: TDeleteUserPrivilegeDTO) => Promise<TAdditionalPrivilege>;
  getPrivilegeDetailsById: (arg: TGetUserPrivilegeDetailsDTO) => Promise<TAdditionalPrivilege>;
  listPrivileges: (arg: TListUserPrivilegesDTO) => Promise<TProjectUserAdditionalPrivilege[]>;
};
