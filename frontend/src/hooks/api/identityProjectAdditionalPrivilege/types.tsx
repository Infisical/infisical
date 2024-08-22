import { TProjectPermission } from "../roles/types";

export enum IdentityProjectAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TIdentityProjectPrivilege = {
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

export type TProjectSpecificPrivilegePermission = {
  conditions: {
    environment: string;
    secretPath?: { $glob: string };
  };
  actions: string[];
  subject: string;
};

export type TCreateIdentityProjectPrivilegeDTO = {
  identityId: string;
  projectSlug: string;
  slug?: string;
  isTemporary?: boolean;
  temporaryMode?: IdentityProjectAdditionalPrivilegeTemporaryMode;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  privilegePermission: TProjectSpecificPrivilegePermission;
};

export type TUpdateIdentityProjectPrivlegeDTO = {
  projectSlug: string;
  identityId: string;
  privilegeSlug: string;
  privilegeDetails: Partial<
    Omit<TCreateIdentityProjectPrivilegeDTO, "projectMembershipId" | "projectId">
  >;
};

export type TDeleteIdentityProjectPrivilegeDTO = {
  projectSlug: string;
  identityId: string;
  privilegeSlug: string;
};

export type TListIdentityUserPrivileges = {
  projectSlug: string;
  identityId: string;
};

export type TGetIdentityProejctPrivilegeDetails = {
  projectSlug: string;
  identityId: string;
  privilegeSlug: string;
};
