import { Knex } from "knex";

import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";

import { TAlertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { AlertPrincipalType } from "./alert-types";

type TDeletedGroupCleanupDeps = {
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "deleteByPrincipals" | "pruneOutOfScopeRecipients">;
};

/**
 * Reads a group's members, then hands back the cleanup to run once the group row is gone.
 *
 * The read has to happen *before* the delete, because deleting the group cascades its user
 * memberships away: a member who reached a project only through this group would otherwise still look
 * in-scope and keep its recipient rows. So callers do:
 *
 *   const finalizeAlertRecipients = await prepareDeletedGroupAlertRecipientCleanup(deps, groupId, tx);
 *   ...delete the group...
 *   await finalizeAlertRecipients();
 *
 * The cleanup drops the group's own recipient rows (principalId carries no FK, so nothing cascades
 * them) and then prunes the members that lost their access with it.
 */
export const prepareDeletedGroupAlertRecipientCleanup = async (
  { userGroupMembershipDAL, alertChannelRecipientDAL }: TDeletedGroupCleanupDeps,
  groupId: string,
  tx: Knex
): Promise<() => Promise<void>> => {
  const memberUserIds = (await userGroupMembershipDAL.find({ groupId }, { tx })).map((m) => m.userId);

  return async () => {
    await alertChannelRecipientDAL.deleteByPrincipals(
      { principalType: AlertPrincipalType.GROUP, principalIds: [groupId] },
      tx
    );
    await alertChannelRecipientDAL.pruneOutOfScopeRecipients({ userIds: memberUserIds }, tx);
  };
};
