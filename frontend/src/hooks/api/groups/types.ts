import { TOrgRole } from "../roles/types";

// TODO: rectify/standardize types

export type TGroupOrgMembership = TGroup & {
  customRole?: TOrgRole;
};

export type TGroup = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  role: string;
};

export type TGroupMembership = {
  id: string;
  group: TGroup;
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

export type TGroupWithProjectMemberships = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
};

export type TGroupUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  isPartOfGroup: boolean;
  joinedGroupAt: Date;
};

export type TGroupProject = {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: string;
  joinedGroupAt: Date;
};

export enum EFilterReturnedUsers {
  EXISTING_MEMBERS = "existingMembers",
  NON_MEMBERS = "nonMembers"
}

export enum EFilterReturnedProjects {
  ASSIGNED_PROJECTS = "assignedProjects",
  UNASSIGNED_PROJECTS = "unassignedProjects"
}
