import { Knex } from "knex";

import { TGroups } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { OrderByDirection, TGenericPermission } from "@app/lib/types";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TIdentityGroupMembershipDALFactory } from "./identity-group-membership-dal";

export type TCreateGroupDTO = {
  name: string;
  slug?: string;
  role: string;
} & TGenericPermission;

export type TUpdateGroupDTO = {
  id: string;
} & Partial<{
  name: string;
  slug: string;
  role: string;
}> &
  TGenericPermission;

export type TDeleteGroupDTO = {
  id: string;
} & TGenericPermission;

export type TGetGroupByIdDTO = {
  id: string;
} & TGenericPermission;

export type TListGroupUsersDTO = {
  id: string;
  offset: number;
  limit: number;
  username?: string;
  search?: string;
  filter?: FilterReturnedUsers;
} & TGenericPermission;

export type TListGroupMachineIdentitiesDTO = {
  id: string;
  offset: number;
  limit: number;
  search?: string;
  filter?: FilterReturnedMachineIdentities;
} & TGenericPermission;

export type TListGroupMembersDTO = {
  id: string;
  offset: number;
  limit: number;
  search?: string;
  orderBy?: GroupMembersOrderBy;
  orderDirection?: OrderByDirection;
  memberTypeFilter?: FilterMemberType[];
} & TGenericPermission;

export type TListGroupProjectsDTO = {
  id: string;
  offset: number;
  limit: number;
  search?: string;
  filter?: FilterReturnedProjects;
  orderBy?: GroupProjectsOrderBy;
  orderDirection?: OrderByDirection;
} & TGenericPermission;

export type TListProjectGroupUsersDTO = TListGroupUsersDTO & {
  projectId: string;
};

export type TAddUserToGroupDTO = {
  id: string;
  username: string;
} & TGenericPermission;

export type TAddMachineIdentityToGroupDTO = {
  id: string;
  identityId: string;
} & TGenericPermission;

export type TRemoveUserFromGroupDTO = {
  id: string;
  username: string;
} & TGenericPermission;

export type TRemoveMachineIdentityFromGroupDTO = {
  id: string;
  identityId: string;
} & TGenericPermission;

// group fns types

export type TAddUsersToGroup = {
  userIds: string[];
  group: TGroups;
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserIdsBatch">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx: Knex;
};

export type TAddUsersToGroupByUserIds = {
  group: TGroups;
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "findUserEncKeyByUserIdsBatch" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
};

export type TAddIdentitiesToGroup = {
  group: TGroups;
  identityIds: string[];
  identityDAL: Pick<TIdentityDALFactory, "transaction">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find" | "insertMany">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
};

export type TRemoveUsersFromGroupByUserIds = {
  group: TGroups;
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "filterProjectsByUserMembership" | "delete">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "delete">;
  tx?: Knex;
};

export type TRemoveIdentitiesFromGroup = {
  group: TGroups;
  identityIds: string[];
  identityDAL: Pick<TIdentityDALFactory, "find" | "transaction">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find" | "delete">;
};

export type TConvertPendingGroupAdditionsToGroupMemberships = {
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserIdsBatch" | "transaction" | "find" | "findById">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "find" | "transaction" | "insertMany" | "deletePendingUserGroupMembershipsByUserIds"
  >;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
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

export enum GroupProjectsOrderBy {
  Name = "name"
}

export enum GroupMembersOrderBy {
  Name = "name"
}

export enum FilterMemberType {
  USERS = "users",
  MACHINE_IDENTITIES = "machineIdentities"
}
