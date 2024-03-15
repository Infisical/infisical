import { useState } from "react";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  DeleteActionModal,
  EmailServiceSetupModal,
  UpgradePlanModal
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useDeleteOrgMembership } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddOrgMemberModal } from "./AddOrgMemberModal";
import { OrgMembersTable } from "./OrgMembersTable";

export const OrgMembersSection = () => {
  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";
  
  const [completeInviteLink, setCompleteInviteLink] = useState<string>("");

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addMember",
    "removeMember",
    "upgradePlan",
    "setUpEmail"
  ] as const);

  const { mutateAsync: deleteMutateAsync } = useDeleteOrgMembership();

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
      <div className="py-4">
        <h2 className="mb-2 text-md text-mineshaft-100">Members</h2>
        <p className="text-sm text-mineshaft-300">Manage who has access to this organization</p>
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
