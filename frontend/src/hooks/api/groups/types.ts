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
  joinedGroupAt: Date;
};

export enum GroupMemberType {
  USER = "user",
  IDENTITY = "identity"
}

export type TGroupMemberUser = TGroupUser & {
  memberType: GroupMemberType.USER;
};

export type TGroupMemberIdentity = TGroupIdentity & {
  memberType: GroupMemberType.IDENTITY;
};

export enum GroupMembersOrderBy {
  Name = "name"
}

export enum FilterMemberType {
  USERS = "users",
  IDENTITIES = "identities"
}

export type TGroupMember = TGroupMemberUser | TGroupMemberIdentity;

export type TGroupIdentity = {
  id: string;
  name: string;
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

export enum FilterReturnedUsers {
  EXISTING_MEMBERS = "existingMembers",
  NON_MEMBERS = "nonMembers"
}

export enum FilterReturnedIdentities {
  ASSIGNED_IDENTITIES = "assignedIdentities",
  NON_ASSIGNED_IDENTITIES = "nonAssignedIdentities"
}

export enum FilterReturnedProjects {
  ASSIGNED_PROJECTS = "assignedProjects",
  UNASSIGNED_PROJECTS = "unassignedProjects"
}
