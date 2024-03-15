import { TProjectPermission } from "@app/lib/types";

export enum IdentityProjectAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TCreateIdentityPrivilegeDTO = (
  | {
      permissions: unknown;
      identityId: string;
      projectId: string;
      name: string;
      slug: string;
      description?: string;
      isTemporary: false;
    }
  | {
      permissions: unknown;
      identityId: string;
      projectId: string;
      name: string;
      slug: string;
      description?: string;
      isTemporary: true;
      temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    }
) &
  Omit<TProjectPermission, "projectId">;

export type TUpdateIdentityPrivilegeDTO = { privilegeId: string } & Omit<TProjectPermission, "projectId"> &
  Partial<{
    permissions: unknown;
    name: string;
    slug: string;
    description?: string;
    isTemporary: boolean;
    temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative;
    temporaryRange: string;
    temporaryAccessStartTime: string;
  }>;

export type TDeleteIdentityPrivilegeDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };

export type TGetIdentityPrivilegeDetailsDTO = Omit<TProjectPermission, "projectId"> & { privilegeId: string };

export type TListIdentityPrivilegesDTO = Omit<TProjectPermission, "projectId"> & {
  identityId: string;
  projectId: string;
};
