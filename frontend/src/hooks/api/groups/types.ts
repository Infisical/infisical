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

export enum GroupMemberType {
  USER = "user",
  MACHINE_IDENTITY = "machineIdentity"
}

export type TGroupUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  joinedGroupAt: Date;
};

export type TGroupMachineIdentity = {
  id: string;
  name: string;
  joinedGroupAt: Date;
};

export type TGroupMemberUser = {
  id: string;
  joinedGroupAt: Date;
  type: GroupMemberType.USER;
  user: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
  };
};

export type TGroupMemberMachineIdentity = {
  id: string;
  joinedGroupAt: Date;
  type: GroupMemberType.MACHINE_IDENTITY;
  machineIdentity: {
    id: string;
    name: string;
  };
};

export type TGroupMember = TGroupMemberUser | TGroupMemberMachineIdentity;

export enum GroupMembersOrderBy {
  Name = "name"
}

export enum FilterMemberType {
  USERS = "users",
  MACHINE_IDENTITIES = "machineIdentities"
}

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

export enum FilterReturnedMachineIdentities {
  ASSIGNED_MACHINE_IDENTITIES = "assignedMachineIdentities",
  NON_ASSIGNED_MACHINE_IDENTITIES = "nonAssignedMachineIdentities"
}

export enum FilterReturnedProjects {
  ASSIGNED_PROJECTS = "assignedProjects",
  UNASSIGNED_PROJECTS = "unassignedProjects"
}
