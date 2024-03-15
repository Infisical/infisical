import { TProjectPermission } from "../roles/types";

export enum ProjectUserAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TProjectUserPrivilege = {
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

export type TCreateProjectUserPrivilegeDTO = {
  projectMembershipId: string;
  slug: string;
  name: string;
  workspaceId: string;
  description?: string;
  isTemporary?: boolean;
  temporaryMode?: ProjectUserAdditionalPrivilegeTemporaryMode;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  permissions: TProjectPermission[];
};

export type TUpdateProjectUserPrivlegeDTO = {
  privilegeId: string;
  workspaceId: string;
} & Partial<Omit<TCreateProjectUserPrivilegeDTO, "projectMembershipId">>;

export type TDeleteProjectUserPrivilegeDTO = {
  privilegeId: string;
  workspaceId: string;
};

export type TGetProejctUserPrivilegeDetails = {
  privilegeId: string;
};
