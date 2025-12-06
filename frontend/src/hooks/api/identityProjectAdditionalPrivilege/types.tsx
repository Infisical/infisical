import { TProjectPermission } from "../roles/types";

export enum IdentityProjectAdditionalPrivilegeTemporaryMode {
  Relative = "relative"
}

export type TIdentityProjectPrivilege = {
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

export type TCreateIdentityProjectPrivilegeDTO = {
  identityId: string;
  projectId: string;
  slug?: string;
  type:
    | {
        isTemporary: true;
        temporaryMode?: IdentityProjectAdditionalPrivilegeTemporaryMode;
        temporaryRange?: string;
        temporaryAccessStartTime?: string;
      }
    | {
        isTemporary: false;
      };
  permissions: TProjectPermission[];
};

export type TUpdateIdentityProjectPrivlegeDTO = {
  projectId: string;
  identityId: string;
  privilegeId: string;
} & Partial<Omit<TCreateIdentityProjectPrivilegeDTO, "projectMembershipId" | "projectId">>;

export type TDeleteIdentityProjectPrivilegeDTO = {
  projectId: string;
  identityId: string;
  privilegeId: string;
};

export type TListIdentityUserPrivileges = {
  projectId: string;
  identityId: string;
};

export type TGetIdentityProejctPrivilegeDetails = {
  projectId: string;
  identityId: string;
  privilegeId: string;
};
