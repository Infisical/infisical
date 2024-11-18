import { TProjectPermission } from "@app/lib/types";

import { TProjectPermissionV2Schema } from "../permission/project-permission";

export enum IdentityProjectAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TCreateIdentityPrivilegeDTO = {
  permissions: TProjectPermissionV2Schema[];
  identityId: string;
  projectId: string;
  slug: string;
} & (
  | {
      isTemporary: false;
    }
  | {
      isTemporary: true;
      temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    }
) &
  Omit<TProjectPermission, "projectId">;

export type TUpdateIdentityPrivilegeByIdDTO = { id: string } & Omit<TProjectPermission, "projectId"> & {
    data: Partial<{
      permissions: TProjectPermissionV2Schema[];
      slug: string;
      isTemporary: boolean;
      temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    }>;
  };

export type TDeleteIdentityPrivilegeByIdDTO = Omit<TProjectPermission, "projectId"> & {
  id: string;
};

export type TGetIdentityPrivilegeDetailsByIdDTO = Omit<TProjectPermission, "projectId"> & {
  id: string;
};

export type TListIdentityPrivilegesDTO = Omit<TProjectPermission, "projectId"> & {
  identityId: string;
  projectId: string;
};

export type TGetIdentityPrivilegeDetailsBySlugDTO = Omit<TProjectPermission, "projectId"> & {
  slug: string;
  identityId: string;
  projectSlug: string;
};
