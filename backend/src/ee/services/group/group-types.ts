import { Knex } from "knex";

import { TGroups } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TGenericPermission } from "@app/lib/types";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessApprovalRequestDALFactory } from "../access-approval-request/access-approval-request-dal";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { TSecretApprovalRequestDALFactory } from "../secret-approval-request/secret-approval-request-dal";

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

export type TAddUsersToGroup = {
  userIds: string[];
  group: TGroups;
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserIdsBatch">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx: Knex;
};

export type TAddUsersToGroupByUserIds = {
  group: TGroups;
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "findUserEncKeyByUserIdsBatch" | "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
};

export type TRemoveUsersFromGroupByUserIds = {
  group: TGroups;
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "find" | "transaction">;
  accessApprovalRequestDAL: Pick<TAccessApprovalRequestDALFactory, "delete">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "delete">;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findByProjectIds">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "filterProjectsByUserMembership" | "delete">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "delete">;
  tx?: Knex;
};

export type TConvertPendingGroupAdditionsToGroupMemberships = {
  userIds: string[];
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserIdsBatch" | "transaction" | "find" | "findById">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "find" | "transaction" | "insertMany" | "deletePendingUserGroupMembershipsByUserIds"
  >;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  tx?: Knex;
};
