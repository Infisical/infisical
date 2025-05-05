import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useSubscription } from "@app/context";
import { useDeleteSshHostGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshHostGroupModal } from "./SshHostGroupModal";
import { SshHostGroupsTable } from "./SshHostGroupsTable";

export const SshHostGroupsSection = () => {
  const { subscription } = useSubscription();
  const { mutateAsync: deleteSshHostGroup } = useDeleteSshHostGroup();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "sshHostGroup",
    "deleteSshHostGroup",
    "upgradePlan"
  ] as const);

  const handleAddSshHostGroupModal = () => {
    if (!subscription?.sshHostGroups) {
      handlePopUpOpen("upgradePlan", {
        description:
          "You can manage hosts more efficiently with SSH host groups if you upgrade your Infisical plan to an Enterprise license."
      });
    } else {
      handlePopUpOpen("sshHostGroup");
    }
  };

  const onRemoveSshHostGroupSubmit = async (sshHostGroupId: string) => {
    try {
      const hostGroup = await deleteSshHostGroup({ sshHostGroupId });

      createNotification({
        text: `Successfully deleted SSH host group: ${hostGroup.name}`,
        type: "success"
      });

      handlePopUpClose("deleteSshHostGroup");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete SSH host group",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Host Groups</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.SshHostGroups}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="button"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddSshHostGroupModal()}
              isDisabled={!isAllowed}
            >
              Add Group
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <SshHostGroupsTable handlePopUpOpen={handlePopUpOpen} />
      <SshHostGroupModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteSshHostGroup.isOpen}
        title={`Are you sure you want to remove the SSH host group: ${popUp?.deleteSshHostGroup?.data?.name}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSshHostGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSshHostGroupSubmit(
            (popUp?.deleteSshHostGroup?.data as { sshHostGroupId: string })?.sshHostGroupId
          )
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </div>
  );
};
