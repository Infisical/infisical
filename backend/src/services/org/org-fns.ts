import { AccessScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";

type TDeleteOrgMembership = {
  orgMembershipId: string;
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "deleteMembershipById" | "transaction">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembershipsByUserId">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "delete">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete">;
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  userId?: string;
};

type TDeleteOrgMemberships = {
  orgMembershipIds: string[];
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "deleteMembershipsById" | "transaction">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembershipsByUserIds">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "delete">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete">;
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  userId?: string;
};

export const deleteOrgMembershipFn = async ({
  orgMembershipId,
  orgId,
  orgDAL,
  projectMembershipDAL,
  projectKeyDAL,
  userAliasDAL,
  licenseService,
  userId,
  membershipUserDAL
}: TDeleteOrgMembership) => {
  const deletedMembership = await orgDAL.transaction(async (tx) => {
    const orgMembership = await orgDAL.deleteMembershipById(orgMembershipId, orgId, tx);

    if (userId && orgMembership.actorUserId === userId) {
      // scott: this is temporary, we will add a leave org endpoint with proper handling to ensure org isn't abandoned/broken
      throw new BadRequestError({ message: "You cannot remove yourself from an organization" });
    }

    const deletedUserId = orgMembership.actorUserId;
    if (!deletedUserId) {
      await licenseService.updateSubscriptionOrgMemberCount(orgId);
      return orgMembership;
    }

    await userAliasDAL.delete(
      {
        userId: deletedUserId,
        orgId
      },
      tx
    );

    // Get all the project memberships of the user in the organization
    const projectMemberships = await projectMembershipDAL.findProjectMembershipsByUserId(orgId, deletedUserId);

    // Delete all the project memberships of the user in the organization
    await membershipUserDAL.delete(
      {
        scope: AccessScope.Project,
        $in: {
          id: projectMemberships.map((membership) => membership.id)
        }
      },
      tx
    );

    // Get all the project keys of the user in the organization
    const projectKeys = await projectKeyDAL.find({
      $in: {
        projectId: projectMemberships.map((membership) => membership.projectId)
      },
      receiverId: deletedUserId
    });

    // Delete all the project keys of the user in the organization
    await projectKeyDAL.delete(
      {
        $in: {
          id: projectKeys.map((key) => key.id)
        }
      },
      tx
    );

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    return orgMembership;
  });

  return deletedMembership;
};

export const deleteOrgMembershipsFn = async ({
  orgMembershipIds,
  orgId,
  orgDAL,
  projectMembershipDAL,
  projectKeyDAL,
  userAliasDAL,
  licenseService,
  userId,
  membershipUserDAL
}: TDeleteOrgMemberships) => {
  const deletedMemberships = await orgDAL.transaction(async (tx) => {
    const orgMemberships = await orgDAL.deleteMembershipsById(orgMembershipIds, orgId, tx);

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
    const projectMemberships = await projectMembershipDAL.findProjectMembershipsByUserIds(orgId, membershipUserIds);

    // Delete all the project memberships of the users in the organization
    await membershipUserDAL.delete(
      {
        scope: AccessScope.Project,
        $in: {
          id: projectMemberships.map((membership) => membership.id)
        }
      },
      tx
    );

    // Get all the project keys of the user in the organization
    const projectKeys = await projectKeyDAL.find({
      $in: {
        projectId: projectMemberships.map((membership) => membership.projectId),
        receiverId: membershipUserIds
      }
    });

    // Delete all the project keys of the user in the organization
    await projectKeyDAL.delete(
      {
        $in: {
          id: projectKeys.map((key) => key.id)
        }
      },
      tx
    );

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    return orgMemberships;
  });

  return deletedMemberships;
};
