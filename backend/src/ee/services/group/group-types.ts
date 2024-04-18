import { Knex } from "knex";

import { TGroups } from "@app/db/schemas";
import { TPendingGroupAdditionDALFactory } from "@app/ee/services/group/pending-group-addition-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TGenericPermission } from "@app/lib/types";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

export type TCreateGroupDTO = {
  name: string;
  slug?: string;
  role: string;
} & TGenericPermission;

export type TUpdateGroupDTO = {
  currentSlug: string;
} & Partial<{
  name: string;
  slug: string;
  role: string;
}> &
  TGenericPermission;

export type TDeleteGroupDTO = {
  groupSlug: string;
} & TGenericPermission;

export type TListGroupUsersDTO = {
  groupSlug: string;
  offset: number;
  limit: number;
  username?: string;
} & TGenericPermission;

export type TAddUserToGroupDTO = {
  groupSlug: string;
  username: string;
} & TGenericPermission;

export type TRemoveUserFromGroupDTO = {
  groupSlug: string;
  username: string;
} & TGenericPermission;

// group fns types

export type TAddUsersToGroupByUserIds = {
  group: TGroups;
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "findUserEncKeyByUsernameBatch" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  pendingGroupAdditionDAL: Pick<TPendingGroupAdditionDALFactory, "insertMany" | "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
};

export type TAddUsersToGroupDirectly = {
  group: TGroups;
  usernames: string[];
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUsernameBatch" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
};

export type TAddUsersToPendingGroupAdditions = {
  userIds: string[];
  group: TGroups;
  pendingGroupAdditionDAL: Pick<TPendingGroupAdditionDALFactory, "find" | "insertMany">;
  userDAL: Pick<TUserDALFactory, "find" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  tx?: Knex;
};

export type TRemoveUsersFromGroupByUserIds = {
  group: TGroups;
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "filterProjectsByUserMembership" | "delete">;
  pendingGroupAdditionDAL: Pick<TPendingGroupAdditionDALFactory, "find" | "delete">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "delete">;
  tx?: Knex;
};

export type TRemoveUsersFromGroupDirectly = {
  group: TGroups;
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "filterProjectsByUserMembership" | "delete">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "delete">;
  tx?: Knex;
};

export type TRemoveUsersFromPendingGroupAdditions = {
  group: TGroups;
  userIds: string[];
  pendingGroupAdditionDAL: Pick<TPendingGroupAdditionDALFactory, "find" | "delete">;
  userDAL: Pick<TUserDALFactory, "find" | "transaction">;
  tx?: Knex;
};

export type TConvertPendingGroupAdditionsToGroupMemberships = {
  userIds: string[];
  pendingGroupAdditionDAL: Pick<TPendingGroupAdditionDALFactory, "deletePendingGroupAdditionsByUserIds">;
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUsernameBatch" | "transaction" | "find" | "findById">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
};
