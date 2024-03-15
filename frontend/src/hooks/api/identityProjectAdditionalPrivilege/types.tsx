import { TProjectPermission } from "../roles/types";

export enum IdentityProjectAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TIdentityProjectPrivilege = {
  projectMembershipId: string;
  slug: string;
  name: string;
  isTemporary: boolean;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  description?: string | null | undefined;
  temporaryMode?: string | null | undefined;
  temporaryRange?: string | null | undefined;
  temporaryAccessStartTime?: string | null | undefined;
  temporaryAccessEndTime?: Date | null | undefined;
  permissions?: TProjectPermission[];
};

export type TCreateIdentityProjectPrivilegeDTO = {
  identityId: string;
  projectId: string;
  slug: string;
  name: string;
  description?: string;
  isTemporary?: boolean;
  temporaryMode?: IdentityProjectAdditionalPrivilegeTemporaryMode;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  permissions: TProjectPermission[];
};

export type TUpdateIdentityProjectPrivlegeDTO = {
  privilegeId: string;
  projectId: string;
} & Partial<Omit<TCreateIdentityProjectPrivilegeDTO, "projectMembershipId" | "projectId">>;

export type TDeleteIdentityProjectPrivilegeDTO = {
  privilegeId: string;
  projectId: string;
};

export type TGetIdentityProejctPrivilegeDetails = {
  privilegeId: string;
};
