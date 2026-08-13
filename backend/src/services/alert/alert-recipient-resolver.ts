import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { OrgMembershipRole } from "@app/db/schemas";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAlertRecipient } from "./alert-channel-types";
import { resolvePrincipalsInScope } from "./alert-principal-scope-fns";
import { AlertPrincipalType } from "./alert-types";

type TAlertRecipientResolverDep = {
  userDAL: Pick<TUserDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "findOrgMembersByRole">;
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

    // Resolved once for the whole call: every channel asking for the admins wants the same answer,
    // and it is a join we should not repeat per channel. Skipped entirely when nobody asked.
    const wantsOrgAdmins = [...rowsByChannel.values()].some((rows) =>
      rows.some((recipient) => recipient.principalType === AlertPrincipalType.ORG_ADMINS)
    );
    const orgAdminUserIds: string[] = [];
    if (wantsOrgAdmins) {
      const admins = await orgDAL.findOrgMembersByRole(scope.orgId, OrgMembershipRole.Admin);
      admins.forEach((admin) => {
        if (admin.user?.id) {
          orgAdminUserIds.push(admin.user.id);
          allUserIds.add(admin.user.id);
        }
      });
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

    const { userIds: inScopeUserIds, groupIds: inScopeGroupIds } = await resolvePrincipalsInScope(
      { orgDAL, projectDAL },
      { orgId: scope.orgId, projectId: scope.projectId, userIds: [...allUserIds], groupIds: [...allGroupIds] }
    );
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
            if (inScopeGroupIds.has(recipient.principalId)) {
              (groupMembers.get(recipient.principalId) ?? []).forEach((userId) => userIds.add(userId));
            }
            break;
          case AlertPrincipalType.ORG_ADMINS:
            orgAdminUserIds.forEach((userId) => userIds.add(userId));
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
