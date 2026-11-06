import { TEmailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAlertRecipient } from "./alert-channel-types";
import {
  findProjectAdminUserIds,
  findUsersWithOrgAccess,
  findVerifiedEmailDomains,
  isOnVerifiedDomain,
  resolvePrincipalsInScope
} from "./alert-principal-scope-fns";
import { AlertPrincipalType } from "./alert-types";

type TAlertRecipientResolverDep = {
  userDAL: Pick<TUserDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "findOrgLinkedGroupIds">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "findAllProjectGroupMembers">;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "find">;
};

type TResolvableRecipient = { principalType: string; principalId: string };

type TResolveScope = { orgId: string; projectId?: string | null };

export type TAlertRecipientResolver = ReturnType<typeof alertRecipientResolverFactory>;

export const alertRecipientResolverFactory = ({
  userDAL,
  userGroupMembershipDAL,
  orgDAL,
  projectDAL,
  projectMembershipDAL,
  groupProjectDAL,
  emailDomainDAL
}: TAlertRecipientResolverDep) => {
  const resolveMany = async (
    rowsByChannel: Map<string, TResolvableRecipient[]>,
    scope: TResolveScope
  ): Promise<Map<string, TAlertRecipient[]>> => {
    const allGroupIds = new Set<string>();
    const allUserIds = new Set<string>();
    let hasEmailRecipients = false;
    for (const rows of rowsByChannel.values()) {
      for (const recipient of rows) {
        if (recipient.principalType === AlertPrincipalType.GROUP) allGroupIds.add(recipient.principalId);
        else if (recipient.principalType === AlertPrincipalType.USER) allUserIds.add(recipient.principalId);
        else if (recipient.principalType === AlertPrincipalType.EMAIL) hasEmailRecipients = true;
      }
    }
    const verifiedDomains = hasEmailRecipients
      ? await findVerifiedEmailDomains(emailDomainDAL, scope.orgId)
      : new Set<string>();

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

    const wantsPrincipal = (principalType: AlertPrincipalType) =>
      Boolean(scope.projectId) &&
      [...rowsByChannel.values()].some((rows) =>
        rows.some((recipient) => recipient.principalType === principalType && recipient.principalId === scope.projectId)
      );
    const wantsProjectMembers = wantsPrincipal(AlertPrincipalType.PROJECT_MEMBERS);
    const wantsProjectAdmins = wantsPrincipal(AlertPrincipalType.PROJECT_ADMINS);
    const projectMemberIds = new Set<string>();
    const projectAdminIds = new Set<string>();
    // Project-wide recipients skip the org check below, which needs a direct org row: in a sub-org everyone
    // gets in through a linked root group and would be dropped. findUsersWithOrgAccess accepts that path
    // instead, and still drops deactivated and invited users.
    if (wantsProjectMembers && scope.projectId) {
      const [directMembers, projectGroupMembers] = await Promise.all([
        projectMembershipDAL.findAllProjectMembers(scope.projectId),
        groupProjectDAL.findAllProjectGroupMembers(scope.projectId)
      ]);
      const memberIds = [...new Set([...directMembers, ...projectGroupMembers].map((member) => member.user.id))];
      (
        await findUsersWithOrgAccess({ orgDAL, userGroupMembershipDAL }, { orgId: scope.orgId, userIds: memberIds })
      ).forEach((userId) => projectMemberIds.add(userId));
    }
    if (wantsProjectAdmins && scope.projectId) {
      (
        await findProjectAdminUserIds(
          { projectMembershipDAL, orgDAL, userGroupMembershipDAL },
          { orgId: scope.orgId, projectId: scope.projectId }
        )
      ).forEach((userId) => projectAdminIds.add(userId));
    }

    const { userIds: inScopeUserIds, groupIds: inScopeGroupIds } = await resolvePrincipalsInScope(
      { orgDAL, projectDAL },
      { orgId: scope.orgId, projectId: scope.projectId, userIds: [...allUserIds], groupIds: [...allGroupIds] }
    );
    const usersToLoad = new Set([...inScopeUserIds, ...projectMemberIds, ...projectAdminIds]);
    const usersById = new Map<string, Awaited<ReturnType<typeof userDAL.find>>[number]>();
    if (usersToLoad.size > 0) {
      const users = await userDAL.find({ $in: { id: [...usersToLoad] } });
      users.forEach((user) => usersById.set(user.id, user));
    }

    const result = new Map<string, TAlertRecipient[]>();
    for (const [channelId, rows] of rowsByChannel.entries()) {
      const userIds = new Set<string>();
      const emails = new Set<string>();

      for (const recipient of rows) {
        switch (recipient.principalType) {
          case AlertPrincipalType.USER:
            if (inScopeUserIds.has(recipient.principalId)) userIds.add(recipient.principalId);
            break;
          case AlertPrincipalType.GROUP:
            if (inScopeGroupIds.has(recipient.principalId)) {
              (groupMembers.get(recipient.principalId) ?? [])
                .filter((userId) => inScopeUserIds.has(userId))
                .forEach((userId) => userIds.add(userId));
            }
            break;
          case AlertPrincipalType.PROJECT_MEMBERS:
            if (scope.projectId && recipient.principalId === scope.projectId) {
              projectMemberIds.forEach((userId) => userIds.add(userId));
            }
            break;
          case AlertPrincipalType.PROJECT_ADMINS:
            if (scope.projectId && recipient.principalId === scope.projectId) {
              projectAdminIds.forEach((userId) => userIds.add(userId));
            }
            break;
          case AlertPrincipalType.EMAIL:
            emails.add(recipient.principalId.toLowerCase());
            break;
          default:
            logger.warn(`Unknown alert recipient principal type '${recipient.principalType}'`);
        }
      }

      const resolved: TAlertRecipient[] = [];
      userIds.forEach((userId) => {
        const user = usersById.get(userId);
        if (user?.email) {
          resolved.push({ userId: user.id, email: user.email, firstName: user.firstName });
        }
      });
      const userEmails = new Set(resolved.map((recipient) => recipient.email.toLowerCase()));
      emails.forEach((email) => {
        if (!userEmails.has(email) && isOnVerifiedDomain(email, verifiedDomains)) resolved.push({ email });
      });

      result.set(channelId, resolved);
    }

    return result;
  };

  return { resolveMany };
};
