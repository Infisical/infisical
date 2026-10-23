import { Knex } from "knex";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPamAccountDALFactory } from "@app/ee/services/pam-account/pam-account-dal";
import { TPamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { OrderByDirection, TGenericPermission } from "@app/lib/types";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TAlertChannelRecipientDALFactory } from "@app/services/alert/alert-channel-recipient-dal";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
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
  group: { id: string; name: string; slug: string; orgId: string };
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserIdsBatch">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx: Knex;
};

export type TAddUsersToGroupByUserIds = {
  group: { id: string; name: string; slug: string; orgId: string };
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "findUserEncKeyByUserIdsBatch" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
  shouldFailOnMissingMembers?: boolean;
  // Optional so SSO/SCIM callers can meter the secret-manager identity count when they sync groups.
  usageMeteringService?: Pick<TUsageMeteringServiceFactory, "emit">;
};

export type TAddIdentitiesToGroup = {
  group: { id: string; name: string; slug: string; orgId: string };
  identityIds: string[];
  identityDAL: Pick<TIdentityDALFactory, "transaction">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find" | "insertMany">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  usageMeteringService?: Pick<TUsageMeteringServiceFactory, "emit">;
};

export type TRemoveUsersFromGroupByUserIds = {
  group: { id: string; name: string; slug: string; orgId: string };
  userIds: string[];
  // The admin removing them, if any; SCIM and IdP group sync have none.
  actorId?: string;
  userDAL: Pick<TUserDALFactory, "find" | "findById" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "filterProjectsByUserMembership" | "delete">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "delete">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  tx?: Knex;
  shouldFailOnMissingMembers?: boolean;
  usageMeteringService?: Pick<TUsageMeteringServiceFactory, "emit">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "pruneOutOfScopeRecipients">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActors">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "find">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "find" | "update">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
};

export type TRemoveIdentitiesFromGroup = {
  group: { id: string; name: string; slug: string; orgId: string };
  identityIds: string[];
  identityDAL: Pick<TIdentityDALFactory, "find" | "transaction">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<
    TIdentityGroupMembershipDALFactory,
    "find" | "delete" | "filterProjectsByIdentityMembership"
  >;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  usageMeteringService?: Pick<TUsageMeteringServiceFactory, "emit">;
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
