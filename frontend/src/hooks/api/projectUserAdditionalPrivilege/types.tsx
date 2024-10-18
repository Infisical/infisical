import { TProjectPermission } from "../roles/types";

export enum ProjectUserAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TProjectSpecificPrivilegePermission = {
  conditions: {
    environment: string;
    secretPath?: { $glob: string };
  };
  actions: string[];
  subject: string;
};

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
  isTemporary?: boolean;
  temporaryMode?: ProjectUserAdditionalPrivilegeTemporaryMode;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  permissions: TProjectSpecificPrivilegePermission;
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
