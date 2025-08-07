import { TOrgRole } from "../roles/types";

// TODO: rectify/standardize types

export type TGroupOrgMembership = TGroup & {
  customRole?: TOrgRole;
};

export type TBaseGroup = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
};

export type TGroupRole = "owner" | "admin" | "member" | "no-access" | "custom";

export type TGroup = TBaseGroup & {
  createdAt: string;
  updatedAt: string;
  role: string;
};

export type TGroupMembership = {
  id: string;
  group: TGroup;
  roles: Array<{
    id: string;
    role: TGroupRole;
    customRoleId: string;
    customRoleName: string;
    customRoleSlug: string;
    isTemporary: boolean;
    temporaryMode: string | null;
    temporaryRange: string | null;
    temporaryAccessStartTime: string | null;
    temporaryAccessEndTime: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type TGroupWithProjectMemberships = TBaseGroup;

export type TGroupUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  isPartOfGroup: boolean;
  joinedGroupAt: Date;
};

export enum EFilterReturnedUsers {
  EXISTING_MEMBERS = "existingMembers",
  NON_MEMBERS = "nonMembers"
}
