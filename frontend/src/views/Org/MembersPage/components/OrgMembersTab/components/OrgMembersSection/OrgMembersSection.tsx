import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
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
import { useDeleteOrgMembership, useGetSSOConfig } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddOrgMemberModal } from "./AddOrgMemberModal";
import { OrgMembersTable } from "./OrgMembersTable";

export const OrgMembersSection = () => {
  const { createNotification } = useNotificationContext();
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";

  const [completeInviteLink, setCompleteInviteLink] = useState<string>("");

  const { data: ssoConfig, isLoading: isLoadingSSOConfig } = useGetSSOConfig(orgId);
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addMember",
    "removeMember",
    "upgradePlan",
    "setUpEmail"
  ] as const);

  const { mutateAsync: deleteMutateAsync } = useDeleteOrgMembership();

  const isMoreUsersNotAllowed = subscription?.memberLimit
    ? subscription.membersUsed >= subscription.memberLimit
    : false;

  const handleAddMemberModal = () => {
    if (!isLoadingSSOConfig && ssoConfig && ssoConfig.isActive) {
      createNotification({
        text: "You cannot invite users when SAML SSO is configured for your organization",
        type: "error"
      });
      return;
    }

    if (isMoreUsersNotAllowed) {
      handlePopUpOpen("upgradePlan", {
        description: "You can add more members if you upgrade your Infisical plan."
      });
    } else {
      handlePopUpOpen("addMember");
    }
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
        <p className="text-xl font-semibold text-mineshaft-100">Members</p>
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
        title={`Are you sure want to remove member with email ${
          (popUp?.removeMember?.data as { email: string })?.email || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveMemberSubmit(
            (popUp?.removeMember?.data as { orgMembershipId: string })?.orgMembershipId
          )
        }
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
