import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAlertRecipient } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

type TAlertRecipientResolverDep = {
  userDAL: Pick<TUserDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
};

type TResolvableRecipient = { principalType: string; principalId: string };

type TResolveScope = { orgId: string; projectId?: string | null };

export type TAlertRecipientResolver = ReturnType<typeof alertRecipientResolverFactory>;

export const alertRecipientResolverFactory = ({
  userDAL,
  userGroupMembershipDAL,
  orgDAL,
  projectDAL
}: TAlertRecipientResolverDep) => {
  const resolveInScopeUserIds = async (
    scope: TResolveScope,
    userIds: string[],
    groupIds: string[]
  ): Promise<Set<string>> => {
    if (userIds.length === 0) return new Set();

    if (scope.projectId) {
      const { effectiveUserIds } = await projectDAL.findEffectiveProjectSubjectsMembership({
        orgId: scope.orgId,
        projectId: scope.projectId,
        userIds,
        groupIds
      });
      return new Set(effectiveUserIds);
    }

    const memberships = await orgDAL.findMembership({ $in: { actorUserId: userIds }, scopeOrgId: scope.orgId });
    return new Set(memberships.map((membership) => membership.actorUserId).filter((id): id is string => Boolean(id)));
  };

  const resolveMany = async (
    rowsByChannel: Map<string, TResolvableRecipient[]>,
    scope: TResolveScope
  ): Promise<Map<string, TAlertRecipient[]>> => {
    const allGroupIds = new Set<string>();
    const allUserIds = new Set<string>();
    for (const rows of rowsByChannel.values()) {
      for (const recipient of rows) {
        if (recipient.principalType === AlertPrincipalType.GROUP) allGroupIds.add(recipient.principalId);
        else if (recipient.principalType === AlertPrincipalType.USER) allUserIds.add(recipient.principalId);
      }
    }

    const groupMembers = new Map<string, string[]>();
    if (allGroupIds.size > 0) {
      const memberships = await userGroupMembershipDAL.find({ $in: { groupId: [...allGroupIds] } });
      memberships.forEach((membership) => {
        const list = groupMembers.get(membership.groupId) ?? [];
        list.push(membership.userId);
        groupMembers.set(membership.groupId, list);
        allUserIds.add(membership.userId);
      });
    }

    const inScopeUserIds = await resolveInScopeUserIds(scope, [...allUserIds], [...allGroupIds]);
    const usersById = new Map<string, Awaited<ReturnType<typeof userDAL.find>>[number]>();
    if (inScopeUserIds.size > 0) {
      const users = await userDAL.find({ $in: { id: [...inScopeUserIds] } });
      users.forEach((user) => usersById.set(user.id, user));
    }

    const result = new Map<string, TAlertRecipient[]>();
    for (const [channelId, rows] of rowsByChannel.entries()) {
      const userIds = new Set<string>();

      for (const recipient of rows) {
        switch (recipient.principalType) {
          case AlertPrincipalType.USER:
            userIds.add(recipient.principalId);
            break;
          case AlertPrincipalType.GROUP:
            (groupMembers.get(recipient.principalId) ?? []).forEach((userId) => userIds.add(userId));
            break;
          default:
            logger.warn(`Unknown alert recipient principal type '${recipient.principalType}'`);
        }
      }

      const resolved: TAlertRecipient[] = [];
      userIds.forEach((userId) => {
        // usersById only holds in-scope users, so out-of-scope recipients are skipped here.
        const user = usersById.get(userId);
        if (user?.email) {
          resolved.push({ userId: user.id, email: user.email, firstName: user.firstName });
        }
      });

      result.set(channelId, resolved);
    }

    return result;
  };

  return { resolveMany };
};
