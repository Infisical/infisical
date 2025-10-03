import { AccessScope } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";

type TDeleteOrgMemberships = {
  orgMembershipIds: string[];
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "transaction">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "delete">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "delete" | "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "delete">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete">;
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  userId?: string;
};

export const deleteOrgMembershipsFn = async ({
  orgMembershipIds,
  orgId,
  orgDAL,
  projectKeyDAL,
  userAliasDAL,
  licenseService,
  userId,
  membershipUserDAL,
  userGroupMembershipDAL,
  membershipRoleDAL
}: TDeleteOrgMemberships) => {
  const deletedMemberships = await orgDAL.transaction(async (tx) => {
    await membershipRoleDAL.delete(
      {
        $in: {
          membershipId: orgMembershipIds
        }
      },
      tx
    );

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
      // scott: this is temporary, we will add a leave org endpoint with proper handling to ensure org isn't abandoned/broken
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

    // Get all the project memberships of the users in the organization

    // Delete all the project memberships of the users in the organization
    const otherMemberships = await membershipUserDAL.delete(
      {
        scopeOrgId: orgId,
        $in: {
          actorUserId: membershipUserIds
        }
      },
      tx
    );

    const orgGroups = await membershipUserDAL.find({
      scopeOrgId: orgId,
      $notNull: ["actorGroupId"]
    });

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
    const projectIds = otherMemberships
      .filter((el) => el.scope === AccessScope.Project && el.scopeProjectId)
      .map((el) => el.scopeProjectId as string);

    // Delete all the project keys of the user in the organization
    await projectKeyDAL.delete(
      {
        $in: {
          projectId: projectIds,
          receiverId: membershipUserIds
        }
      },
      tx
    );

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    return orgMemberships;
  });

  return deletedMemberships;
};
