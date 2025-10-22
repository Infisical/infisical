import { useState } from "react";
import { faBan, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DeleteActionModal,
  EmailServiceSetupModal,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser
} from "@app/context";
import { useDeleteOrgMembership, useGetOrgUsers, useUpdateOrgMembership } from "@app/hooks/api";
import { useDeleteOrgMembershipBatch } from "@app/hooks/api/users/queries";
import { OrgUser } from "@app/hooks/api/users/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddOrgMemberModal } from "./AddOrgMemberModal";
import { AddSubOrgMemberModal } from "./AddSubOrgMemberModal";
import { OrgMembersTable } from "./OrgMembersTable";

export const OrgMembersSection = () => {
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id ?? "";
  const { user } = useUser();
  const userId = user?.id || "";
  const [completeInviteLinks, setCompleteInviteLinks] = useState<Array<{
    email: string;
    link: string;
  }> | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addMember",
    "addMemberToSubOrg",
    "removeMember",
    "deactivateMember",
    "upgradePlan",
    "setUpEmail",
    "removeMembers"
  ] as const);

  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const { mutateAsync: deleteMutateAsync } = useDeleteOrgMembership();
  const { mutateAsync: deleteBatchMutateAsync } = useDeleteOrgMembershipBatch();
  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();

  const isMoreIdentitiesAllowed = subscription?.identityLimit
    ? subscription.identitiesUsed < subscription.identityLimit
    : true;

  const isEnterprise = subscription?.slug === "enterprise";

  const handleAddMemberModal = () => {
    if (currentOrg?.authEnforced) {
      createNotification({
        text: "You cannot manage users from Infisical when org-level auth is enforced for your organization",
        type: "error"
      });
      return;
    }

    if (!isMoreIdentitiesAllowed && !isEnterprise) {
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

  const { data: members = [] } = useGetOrgUsers(orgId);

  const handleRemoveMembers = async (selectedMembers: OrgUser[]) => {
    try {
      await deleteBatchMutateAsync({
        orgId,
        membershipIds: selectedMembers
          .filter((member) => member.user.id !== userId)
          .map((member) => member.id)
      });

      createNotification({
        text: selectedMembers.length === 1 && members.length === 1 ? "At least one member must remain in the organization" : "Successfully removed users from organization",
        type: selectedMembers.length === 1 && members.length === 1 ? "error" : "success"
      });

      setSelectedMemberIds([]);
      handlePopUpClose("removeMembers");
    } catch {
      createNotification({
        text: "Failed to remove users from the organization",
        type: "error"
      });
    }
  };

  return (
    <>
      <div
        className={twMerge(
          "h-0 shrink-0 overflow-hidden transition-all",
          selectedMemberIds.length > 0 && "h-16"
        )}
      >
        <div className="flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-bunker-300">
          <div className="mr-2 text-sm">{selectedMemberIds.length} Selected</div>
          <button
            type="button"
            className="mr-auto text-xs text-mineshaft-400 underline-offset-2 hover:text-mineshaft-200 hover:underline"
            onClick={() => setSelectedMemberIds([])}
          >
            Unselect All
          </button>
          <OrgPermissionCan
            I={OrgPermissionActions.Delete}
            a={OrgPermissionSubjects.Member}
            renderTooltip
            allowedLabel={
              currentOrg?.scimEnabled
                ? "You cannot manage users from Infisical when org-level auth is enforced for your organization"
                : undefined
            }
          >
            {(isAllowed) => (
              <Button
                variant="outline_bg"
                colorSchema="danger"
                leftIcon={<FontAwesomeIcon icon={faTrash} />}
                className="ml-2"
                onClick={() => {
                  const selectedOrgMemberships = members.filter((member) =>
                    selectedMemberIds.includes(member.id)
                  );

                  if (!selectedOrgMemberships.length) return;

                  handlePopUpOpen("removeMembers", { selectedOrgMemberships });
                }}
                isDisabled={!isAllowed || currentOrg?.scimEnabled}
                size="xs"
              >
                Delete
              </Button>
            )}
          </OrgPermissionCan>
        </div>
      </div>
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xl font-medium text-mineshaft-100">Users</p>
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() =>
                  isSubOrganization ? handlePopUpOpen("addMemberToSubOrg") : handleAddMemberModal()
                }
                isDisabled={!isAllowed}
              >
                Add Member
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <OrgMembersTable
          handlePopUpOpen={handlePopUpOpen}
          setCompleteInviteLinks={setCompleteInviteLinks}
          selectedMemberIds={selectedMemberIds}
          setSelectedMemberIds={setSelectedMemberIds}
        />
        <AddOrgMemberModal
          popUp={popUp}
          handlePopUpToggle={handlePopUpToggle}
          completeInviteLinks={completeInviteLinks}
          setCompleteInviteLinks={setCompleteInviteLinks}
        />
        <Modal
          isOpen={popUp.addMemberToSubOrg.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addMemberToSubOrg", isOpen)}
        >
          <ModalContent title="Add member from your organization">
            <AddSubOrgMemberModal onClose={() => handlePopUpClose("addMemberToSubOrg")} />
          </ModalContent>
        </Modal>
        <DeleteActionModal
          isOpen={popUp.removeMember.isOpen}
          title={`Are you sure you want to remove member with username ${
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
          title={`Are you sure you want to deactivate member with username ${
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
        <DeleteActionModal
          isOpen={popUp.removeMembers.isOpen}
          title="Are you sure you want to remove the following members?"
          onChange={(isOpen) => handlePopUpToggle("removeMembers", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            handleRemoveMembers(popUp.removeMembers.data.selectedOrgMemberships as OrgUser[])
          }
          buttonText="Remove"
        >
          <div className="mt-4 text-sm text-mineshaft-400">
            The following members will be removed:
          </div>
          <div className="mt-2 max-h-80 overflow-y-auto rounded-sm border border-mineshaft-600 bg-red/10 p-4 pl-8 text-sm text-red-200">
            <ul className="list-disc">
              {(popUp.removeMembers.data?.selectedOrgMemberships as OrgUser[])?.map((member) => {
                const email = member.user.email ?? member.user.username ?? member.inviteEmail;
                return (
                  <li key={member.id}>
                    <div className="flex items-center">
                      <p className={userId === member.user.id ? "line-through" : ""}>
                        {member.user.firstName || member.user.lastName ? (
                          <>
                            {`${`${member.user.firstName} ${member.user.lastName}`.trim()} `}(
                            <span className="break-all">{email}</span>)
                          </>
                        ) : (
                          <span className="break-all">{email}</span>
                        )}{" "}
                      </p>
                      {userId === member.user.id && (
                        <Tooltip content="You cannot remove yourself from this organization">
                          <div className="inline-block">
                            <Badge
                              variant="danger"
                              className="mt-[0.05rem] ml-1 inline-flex w-min items-center gap-1.5 whitespace-nowrap"
                            >
                              <FontAwesomeIcon icon={faBan} />
                              <span>Ignored</span>
                            </Badge>
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </DeleteActionModal>
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
    </>
  );
};
