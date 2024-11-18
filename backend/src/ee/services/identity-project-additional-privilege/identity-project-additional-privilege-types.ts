import { TProjectPermission } from "@app/lib/types";

import { TProjectPermissionV2Schema } from "../permission/project-permission";

export enum IdentityProjectAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TCreateIdentityPrivilegeDTO = {
  permissions: TProjectPermissionV2Schema[];
  identityId: string;
  projectSlug: string;
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

export type TUpdateIdentityPrivilegeDTO = { slug: string; identityId: string; projectSlug: string } & Omit<
  TProjectPermission,
  "projectId"
> & {
    data: Partial<{
      permissions: TProjectPermissionV2Schema[];
      slug: string;
      isTemporary: boolean;
      temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    }>;
  };

export type TDeleteIdentityPrivilegeDTO = Omit<TProjectPermission, "projectId"> & {
  slug: string;
  identityId: string;
  projectSlug: string;
};

export type TGetIdentityPrivilegeDetailsDTO = Omit<TProjectPermission, "projectId"> & {
  slug: string;
  identityId: string;
  projectSlug: string;
};

export type TListIdentityPrivilegesDTO = Omit<TProjectPermission, "projectId"> & {
  identityId: string;
  projectSlug: string;
};
