import { AccessScope } from "@app/db/schemas";
import { TAgentVaultAccessBundleMemberDALFactory } from "@app/ee/services/agent-vault-member/agent-vault-access-bundle-member-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TAlertChannelRecipientDALFactory } from "../alert/alert-channel-recipient-dal";
import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { APPLICATION_APPROVAL_SCOPES } from "../membership/application-membership-cleanup-service";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { assertWillRetainOrgAdmin } from "../membership-user/membership-user-fns";

type TDeleteOrgMemberships = {
  orgMembershipIds: string[];
  orgId: string;
  orgDAL: Pick<TOrgDALFactory, "transaction" | "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "delete">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "delete" | "find" | "countActiveAdmins">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "delete">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete">;
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "updateSubscriptionOrgMemberCount">;
  userId?: string;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "deleteUserStepApproversInProjects">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "pruneOutOfScopeRecipients">;
  agentVaultAccessBundleMemberDAL: Pick<TAgentVaultAccessBundleMemberDALFactory, "deleteUserGrantsInProjects">;
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
  additionalPrivilegeDAL,
  approvalPolicyDAL,
  alertChannelRecipientDAL,
  agentVaultAccessBundleMemberDAL
}: TDeleteOrgMemberships) => {
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

    // Get all the project memberships of the users in the organization
    const childOrgs = await orgDAL.find({ rootOrgId: orgId }, { tx });

    // Delete all the project memberships of the users in the organization
    const otherMemberships = await membershipUserDAL.delete(
      {
        $in: {
          scopeOrgId: [orgId].concat(childOrgs.map((el) => el.id)),
          actorUserId: membershipUserIds
        }
      },
      tx
    );

    const orgGroups = await membershipUserDAL.find({
      $in: {
        scopeOrgId: [orgId].concat(childOrgs.map((el) => el.id))
      },
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

    await additionalPrivilegeDAL.delete(
      {
        $in: {
          projectId: projectIds,
          actorUserId: membershipUserIds
        }
      },
      tx
    );

    await approvalPolicyDAL.deleteUserStepApproversInProjects(
      {
        projectIds,
        userIds: membershipUserIds,
        scopeTypes: APPLICATION_APPROVAL_SCOPES
      },
      tx
    );

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

    await alertChannelRecipientDAL.pruneOutOfScopeRecipients({ userIds: membershipUserIds }, tx);

    // Agent Vault grants live in their own table keyed on the user, not on the membership, so deleting
    // the membership rows above leaves them behind. They cannot be used while the actor is out of the
    // org - resolve refuses anyone without an active org membership - but re-inviting the same person
    // and adding them back to Agent Vault would silently restore every bundle they used to hold.
    await agentVaultAccessBundleMemberDAL.deleteUserGrantsInProjects({ projectIds, userIds: membershipUserIds }, tx);

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    return orgMemberships;
  });

  return deletedMemberships;
};
