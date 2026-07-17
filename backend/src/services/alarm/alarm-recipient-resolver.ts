import { TAlarmRecipients } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAlarmRecipient } from "./alarm-channel-types";
import { AlarmPrincipalType } from "./alarm-types";

type TAlarmRecipientResolverDep = {
  userDAL: Pick<TUserDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
};

export type TAlarmRecipientResolver = ReturnType<typeof alarmRecipientResolverFactory>;

export const alarmRecipientResolverFactory = ({ userDAL, userGroupMembershipDAL }: TAlarmRecipientResolverDep) => {
  const resolve = async (recipients: TAlarmRecipients[]): Promise<TAlarmRecipient[]> => {
    const userIds = new Set<string>();
    const groupIds = new Set<string>();
    const rawEmails = new Set<string>();

    for (const recipient of recipients) {
      switch (recipient.principalType) {
        case AlarmPrincipalType.USER:
          userIds.add(recipient.principalId);
          break;
        case AlarmPrincipalType.GROUP:
          groupIds.add(recipient.principalId);
          break;
        case AlarmPrincipalType.EMAIL:
          rawEmails.add(recipient.principalId.toLowerCase());
          break;
        default:
          logger.warn(`Unknown alarm recipient principal type '${recipient.principalType}'`);
      }
    }

    if (groupIds.size > 0) {
      const memberships = await userGroupMembershipDAL.find({ $in: { groupId: [...groupIds] } });
      memberships.forEach((membership) => userIds.add(membership.userId));
    }

    const resolved: TAlarmRecipient[] = [];
    const seenEmails = new Set<string>();

    if (userIds.size > 0) {
      const users = await userDAL.find({ $in: { id: [...userIds] } });
      users
        .filter((user) => Boolean(user.email))
        .forEach((user) => {
          const email = user.email as string;
          seenEmails.add(email.toLowerCase());
          resolved.push({ userId: user.id, email, firstName: user.firstName });
        });
    }

    rawEmails.forEach((email) => {
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        resolved.push({ email });
      }
    });

    return resolved;
  };

  return { resolve };
};
