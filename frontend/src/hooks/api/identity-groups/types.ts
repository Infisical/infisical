import { TOrgRole } from "../roles/types";

export type TIdentityGroupOrgMembership = TIdentityGroup & {
  customRole?: TOrgRole;
};

export type TIdentityGroup = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  role: string;
};

export type TIdentityGroupMembership = {
  id: string;
  group: TIdentityGroup;
  roles: {
    id: string;
    role: "owner" | "admin" | "member" | "no-access" | "custom";
    customRoleId: string;
    customRoleName: string;
    customRoleSlug: string;
    isTemporary: boolean;
    temporaryMode: string | null;
    temporaryRange: string | null;
    temporaryAccessStartTime: string | null;
    temporaryAccessEndTime: string | null;
  }[];
  createdAt: string;
  updatedAt: string;
};

export type TIdentityGroupWithProjectMemberships = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
};

export type TIdentityGroupIdentity = {
  id: string;
  name: string;
  authMethod: string | null;
  isPartOfGroup: boolean;
  joinedGroupAt: Date;
};

export enum EFilterReturnedIdentities {
  EXISTING_MEMBERS = "existingMembers",
  NON_MEMBERS = "nonMembers"
}
