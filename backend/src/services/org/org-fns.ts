import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TProjectUserAdditionalPrivilegeDALFactory } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-dal";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

type TDeleteOrgMembership = {
  orgMembershipId: string;
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "deleteMembershipById" | "transaction">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "delete" | "findProjectMembershipsByUserId">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete">;
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  projectUserAdditionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "delete">;
  userId?: string;
};

type TDeleteOrgMemberships = {
  orgMembershipIds: string[];
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "deleteMembershipsById" | "transaction">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "delete" | "findProjectMembershipsByUserIds">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete">;
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  projectUserAdditionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "delete">;
  userId?: string;
};

export const deleteOrgMembershipFn = async ({
  orgMembershipId,
  orgId,
  orgDAL,
  projectMembershipDAL,
  projectUserAdditionalPrivilegeDAL,
  projectKeyDAL,
  userAliasDAL,
  licenseService,
  userId
}: TDeleteOrgMembership) => {
  const deletedMembership = await orgDAL.transaction(async (tx) => {
    const orgMembership = await orgDAL.deleteMembershipById(orgMembershipId, orgId, tx);

    if (userId && orgMembership.userId === userId) {
      // scott: this is temporary, we will add a leave org endpoint with proper handling to ensure org isn't abandoned/broken
      throw new BadRequestError({ message: "You cannot remove yourself from an organization" });
    }

    if (!orgMembership.userId) {
      await licenseService.updateSubscriptionOrgMemberCount(orgId);
      return orgMembership;
    }

    await userAliasDAL.delete(
      {
        userId: orgMembership.userId,
        orgId
      },
      tx
    );

    await projectUserAdditionalPrivilegeDAL.delete(
      {
        userId: orgMembership.userId
      },
      tx
    );

    // Get all the project memberships of the user in the organization
    const projectMemberships = await projectMembershipDAL.findProjectMembershipsByUserId(orgId, orgMembership.userId);

    // Delete all the project memberships of the user in the organization
    await projectMembershipDAL.delete(
      {
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
      receiverId: orgMembership.userId
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
  projectUserAdditionalPrivilegeDAL,
  projectKeyDAL,
  userAliasDAL,
  licenseService,
  userId
}: TDeleteOrgMemberships) => {
  const deletedMemberships = await orgDAL.transaction(async (tx) => {
    const orgMemberships = await orgDAL.deleteMembershipsById(orgMembershipIds, orgId, tx);

    const membershipUserIds = orgMemberships
      .filter((member) => Boolean(member.userId))
      .map((member) => member.userId) as string[];

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

    await projectUserAdditionalPrivilegeDAL.delete(
      {
        $in: {
          userId: membershipUserIds
        }
      },
      tx
    );

    // Get all the project memberships of the users in the organization
    const projectMemberships = await projectMembershipDAL.findProjectMembershipsByUserIds(orgId, membershipUserIds);

    // Delete all the project memberships of the users in the organization
    await projectMembershipDAL.delete(
      {
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
