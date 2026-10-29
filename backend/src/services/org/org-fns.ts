import { AccessScope } from "@app/db/schemas";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";
import { auditRevokedProjectAccess } from "@app/services/org/org-access-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import {
  emitOrgMembershipRemoved,
  OrgAccessRemovalCause,
  toOrgMembershipActors
} from "@app/services/org/org-membership-events";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { TEventEmitter } from "../event-outbox/event-outbox-types";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { assertWillRetainOrgAdmin } from "../membership-user/membership-user-fns";
import { TProjectAccessRevokeServiceFactory, TRevokedProjectAccess } from "../membership/project-access-revoke-service";

type TDeleteOrgMemberships = {
  orgMembershipIds: string[];
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "transaction" | "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "delete">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "delete" | "find" | "countActiveAdmins">;
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  userId?: string;
  projectAccessRevokeService: Pick<TProjectAccessRevokeServiceFactory, "revokeActorsInOrgs">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  eventEmitter: TEventEmitter;
};

// Removes the users from the org and its sub-orgs outright, org rows, groups and project access included.
// Still emits the event so the reconcile consumer can confirm nothing's left. The project access entry is
// written here since the consumer only audits rows it deleted itself.
export const deleteOrgMembershipsFn = async ({
  orgMembershipIds,
  orgId,
  orgDAL,
  userAliasDAL,
  licenseService,
  userId,
  membershipUserDAL,
  userGroupMembershipDAL,
  projectAccessRevokeService,
  auditLogService,
  eventEmitter
}: TDeleteOrgMemberships) => {
  let sendPamCancellations = () => {};
  let revoked: TRevokedProjectAccess[] = [];

  const deletedMemberships = await orgDAL.transaction(async (tx) => {
    await assertWillRetainOrgAdmin({
      scopeOrgId: orgId,
      excludeMembershipIds: orgMembershipIds,
      dal: membershipUserDAL,
      tx
    });

    const orgMemberships = await membershipUserDAL.delete(
      {
        scopeOrgId: orgId,
        scope: AccessScope.Organization,
        $in: {
          id: orgMembershipIds
        }
      },
      tx
    );

    const membershipUserIds = orgMemberships
      .filter((member) => Boolean(member.actorUserId))
      .map((member) => member.actorUserId) as string[];

    if (userId && membershipUserIds.includes(userId)) {
      throw new BadRequestError({ message: "You cannot remove yourself from an organization" });
    }

    if (!membershipUserIds.length) {
      await licenseService.updateSubscriptionOrgMemberCount(orgId);
      return orgMemberships;
    }

    await userAliasDAL.delete(
      {
        $in: {
          userId: membershipUserIds
        },
        orgId
      },
      tx
    );

    const childOrgIds = (await orgDAL.find({ rootOrgId: orgId }, { tx })).map((org) => org.id);
    const orgIds = [orgId, ...childOrgIds];

    if (childOrgIds.length) {
      await membershipUserDAL.delete(
        {
          scope: AccessScope.Organization,
          $in: {
            scopeOrgId: childOrgIds,
            actorUserId: membershipUserIds
          }
        },
        tx
      );
    }

    const orgGroups = await membershipUserDAL.find(
      {
        $in: {
          scopeOrgId: orgIds
        },
        $notNull: ["actorGroupId"]
      },
      { tx }
    );

    const groupIds = orgGroups.filter((el) => el.actorGroupId).map((el) => el.actorGroupId as string);

    await userGroupMembershipDAL.delete(
      {
        $in: {
          userId: membershipUserIds,
          groupId: groupIds
        }
      },
      tx
    );

    ({ revoked, sendPamCancellations } = await projectAccessRevokeService.revokeActorsInOrgs(
      { orgIds, userIds: membershipUserIds },
      tx
    ));

    await emitOrgMembershipRemoved(
      eventEmitter,
      { orgId, actors: toOrgMembershipActors({ userIds: membershipUserIds }) },
      tx
    );

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    return orgMemberships;
  });

  sendPamCancellations();
  await auditRevokedProjectAccess({ auditLogService, revoked, reason: OrgAccessRemovalCause.RemovedFromOrg });

  return deletedMemberships;
};
