import { TProjectPermission } from "../roles/types";

export enum ProjectUserAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TProjectUserPrivilege = {
  projectMembershipId: string;
  slug: string;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  permissions?: TProjectPermission[];
} & (
  | {
      isTemporary: true;
      temporaryMode: string;
      temporaryRange: string;
      temporaryAccessStartTime: string;
      temporaryAccessEndTime?: string;
    }
  | {
      isTemporary: false;
      temporaryMode?: null;
      temporaryRange?: null;
      temporaryAccessStartTime?: null;
      temporaryAccessEndTime?: null;
    }
);

export type TCreateProjectUserPrivilegeDTO = {
  projectMembershipId: string;
  slug?: string;
  type:
    | {
        isTemporary: true;
        temporaryMode?: ProjectUserAdditionalPrivilegeTemporaryMode;
        temporaryRange?: string;
        temporaryAccessStartTime?: string;
      }
    | {
        isTemporary: false;
      };
  permissions: TProjectPermission[];
};

export type TUpdateProjectUserPrivlegeDTO = {
  privilegeId: string;
  projectMembershipId: string;
} & Partial<Omit<TCreateProjectUserPrivilegeDTO, "projectMembershipId">>;

export type TDeleteProjectUserPrivilegeDTO = {
  privilegeId: string;
  projectMembershipId: string;
};

export type TGetProjectUserPrivilegeDetails = {
  privilegeId: string;
};

export type TListProjectUserPrivileges = {
  projectMembershipId: string;
};
