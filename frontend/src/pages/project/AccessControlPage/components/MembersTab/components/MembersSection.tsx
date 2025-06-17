import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteUserFromWorkspace } from "@app/hooks/api";

import { AddMemberModal } from "./AddMemberModal";
import { MembersTable } from "./MembersTable";

export const MembersSection = () => {
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember",
    "upgradePlan"
  ] as const);

  const handleRemoveUser = async () => {
    const username = (popUp?.removeMember?.data as { username: string })?.username;
    if (!currentOrg?.id) return;
    if (!currentWorkspace?.id) return;

    try {
      await removeUserFromWorkspace({
        workspaceId: currentWorkspace.id,
        usernames: [username],
        orgId: currentOrg.id
      });
      createNotification({
        text: "Successfully removed user from project",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove user from the project",
        type: "error"
      });
    }
    handlePopUpClose("removeMember");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Users</p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("addMember")}
              isDisabled={!isAllowed}
            >
              Add Member
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <MembersTable handlePopUpOpen={handlePopUpOpen} />
      <AddMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title="Do you want to remove this user from the project?"
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </div>
  );
};
