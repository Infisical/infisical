import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAlarmRecipient } from "./alarm-channel-types";
import { AlarmPrincipalType } from "./alarm-types";

type TAlarmRecipientResolverDep = {
  userDAL: Pick<TUserDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
};

type TResolvableRecipient = { principalType: string; principalId: string };

export type TAlarmRecipientResolver = ReturnType<typeof alarmRecipientResolverFactory>;

export const alarmRecipientResolverFactory = ({ userDAL, userGroupMembershipDAL }: TAlarmRecipientResolverDep) => {
  const resolveMany = async (
    rowsByChannel: Map<string, TResolvableRecipient[]>
  ): Promise<Map<string, TAlarmRecipient[]>> => {
    const allGroupIds = new Set<string>();
    const allUserIds = new Set<string>();
    for (const rows of rowsByChannel.values()) {
      for (const recipient of rows) {
        if (recipient.principalType === AlarmPrincipalType.GROUP) allGroupIds.add(recipient.principalId);
        else if (recipient.principalType === AlarmPrincipalType.USER) allUserIds.add(recipient.principalId);
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

    const result = new Map<string, TAlarmRecipient[]>();
    for (const [channelId, rows] of rowsByChannel.entries()) {
      const userIds = new Set<string>();
      const rawEmails = new Set<string>();

      for (const recipient of rows) {
        switch (recipient.principalType) {
          case AlarmPrincipalType.USER:
            userIds.add(recipient.principalId);
            break;
          case AlarmPrincipalType.GROUP:
            (groupMembers.get(recipient.principalId) ?? []).forEach((userId) => userIds.add(userId));
            break;
          case AlarmPrincipalType.EMAIL:
            rawEmails.add(recipient.principalId.toLowerCase());
            break;
          default:
            logger.warn(`Unknown alarm recipient principal type '${recipient.principalType}'`);
        }
      }

      const resolved: TAlarmRecipient[] = [];
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

  const resolve = async (recipients: TResolvableRecipient[]): Promise<TAlarmRecipient[]> => {
    const resolved = await resolveMany(new Map([["", recipients]]));
    return resolved.get("") ?? [];
  };

  return { resolve, resolveMany };
};
