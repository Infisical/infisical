import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmailServiceSetupModal,
  UpgradePlanModal
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useDeleteOrgMembership, useUpdateOrgMembership } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddOrgMemberModal } from "./AddOrgMemberModal";
import { OrgMembersTable } from "./OrgMembersTable";

export const OrgMembersSection = () => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";

  const [completeInviteLink, setCompleteInviteLink] = useState<string>("");

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addMember",
    "removeMember",
    "deactivateMember",
    "upgradePlan",
    "setUpEmail"
  ] as const);

  const { mutateAsync: deleteMutateAsync } = useDeleteOrgMembership();
  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();

  const isMoreUsersAllowed = subscription?.memberLimit
    ? subscription.membersUsed < subscription.memberLimit
    : true;

  const isMoreIdentitiesAllowed = subscription?.identityLimit
    ? subscription.identitiesUsed < subscription.identityLimit
    : true;

  const handleAddMemberModal = () => {
    if (currentOrg?.authEnforced) {
      createNotification({
        text: "You cannot manage users from Infisical when org-level auth is enforced for your organization",
        type: "error"
      });
      return;
    }

    if (!isMoreUsersAllowed || !isMoreIdentitiesAllowed) {
      handlePopUpOpen("upgradePlan", {
        description: "You can add more members if you upgrade your Infisical plan."
      });
      return;
    }

    handlePopUpOpen("addMember");
  };

  const onDeactivateMemberSubmit = async (orgMembershipId: string) => {
    try {
      await updateOrgMembership({
        organizationId: orgId,
        membershipId: orgMembershipId,
        isActive: false
      });

      createNotification({
        text: "Successfully deactivated user in organization",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to deactivate user in organization",
        type: "error"
      });
    }

    handlePopUpClose("deactivateMember");
  };

  const onRemoveMemberSubmit = async (orgMembershipId: string) => {
    try {
      await deleteMutateAsync({
        orgId,
        membershipId: orgMembershipId
      });

      createNotification({
        text: "Successfully removed user from org",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to remove user from the organization",
        type: "error"
      });
    }

    handlePopUpClose("removeMember");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Users</p>
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddMemberModal()}
              isDisabled={!isAllowed}
            >
              Add Member
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <OrgMembersTable
        handlePopUpOpen={handlePopUpOpen}
        setCompleteInviteLink={setCompleteInviteLink}
      />
      <AddOrgMemberModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        completeInviteLink={completeInviteLink}
        setCompleteInviteLink={setCompleteInviteLink}
      />
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        title={`Are you sure want to remove member with username ${
          (popUp?.removeMember?.data as { username: string })?.username || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveMemberSubmit(
            (popUp?.removeMember?.data as { orgMembershipId: string })?.orgMembershipId
          )
        }
      />
      <DeleteActionModal
        isOpen={popUp.deactivateMember.isOpen}
        title={`Are you sure want to deactivate member with username ${
          (popUp?.deactivateMember?.data as { username: string })?.username || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deactivateMember", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeactivateMemberSubmit(
            (popUp?.deactivateMember?.data as { orgMembershipId: string })?.orgMembershipId
          )
        }
        buttonText="Deactivate"
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
};
