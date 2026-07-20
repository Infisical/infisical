import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAlertRecipient } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

type TAlertRecipientResolverDep = {
  userDAL: Pick<TUserDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
};

type TResolvableRecipient = { principalType: string; principalId: string };

export type TAlertRecipientResolver = ReturnType<typeof alertRecipientResolverFactory>;

export const alertRecipientResolverFactory = ({ userDAL, userGroupMembershipDAL }: TAlertRecipientResolverDep) => {
  const resolveMany = async (
    rowsByChannel: Map<string, TResolvableRecipient[]>
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

    const usersById = new Map<string, Awaited<ReturnType<typeof userDAL.find>>[number]>();
    if (allUserIds.size > 0) {
      const users = await userDAL.find({ $in: { id: [...allUserIds] } });
      users.forEach((user) => usersById.set(user.id, user));
    }

    const result = new Map<string, TAlertRecipient[]>();
    for (const [channelId, rows] of rowsByChannel.entries()) {
      const userIds = new Set<string>();
      const rawEmails = new Set<string>();

      for (const recipient of rows) {
        switch (recipient.principalType) {
          case AlertPrincipalType.USER:
            userIds.add(recipient.principalId);
            break;
          case AlertPrincipalType.GROUP:
            (groupMembers.get(recipient.principalId) ?? []).forEach((userId) => userIds.add(userId));
            break;
          case AlertPrincipalType.EMAIL:
            rawEmails.add(recipient.principalId.toLowerCase());
            break;
          default:
            logger.warn(`Unknown alert recipient principal type '${recipient.principalType}'`);
        }
      }

      const resolved: TAlertRecipient[] = [];
      const seenEmails = new Set<string>();

      userIds.forEach((userId) => {
        const user = usersById.get(userId);
        if (user?.email) {
          seenEmails.add(user.email.toLowerCase());
          resolved.push({ userId: user.id, email: user.email, firstName: user.firstName });
        }
      });

      rawEmails.forEach((email) => {
        if (!seenEmails.has(email)) {
          seenEmails.add(email);
          resolved.push({ email });
        }
      });

      result.set(channelId, resolved);
    }

    return result;
  };

  const resolve = async (recipients: TResolvableRecipient[]): Promise<TAlertRecipient[]> => {
    const resolved = await resolveMany(new Map([["", recipients]]));
    return resolved.get("") ?? [];
  };

  return { resolve, resolveMany };
};
