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

export type TCreateIdentityProjectPrivilegeDTO = {
  identityId: string;
  projectSlug: string;
  slug?: string;
  isTemporary?: boolean;
  temporaryMode?: IdentityProjectAdditionalPrivilegeTemporaryMode;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  permissions: TProjectPermission[];
};

export type TUpdateIdentityProjectPrivlegeDTO = {
  projectSlug: string;
  identityId: string;
  slug: string;
  data: Partial<Omit<TCreateIdentityProjectPrivilegeDTO, "projectMembershipId" | "projectId">>;
};

export type TDeleteIdentityProjectPrivilegeDTO = {
  projectSlug: string;
  identityId: string;
  slug: string;
};

export type TListIdentityUserPrivileges = {
  projectSlug: string;
  identityId: string;
};

export type TGetIdentityProejctPrivilegeDetails = {
  projectSlug: string;
  identityId: string;
  slug: string;
};
