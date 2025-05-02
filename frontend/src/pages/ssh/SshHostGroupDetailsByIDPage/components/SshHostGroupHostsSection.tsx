import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useRemoveHostFromSshHostGroup } from "@app/hooks/api";

import { AddHostGroupMemberModal } from "./AddHostGroupMemberModal";
import { SshHostGroupHostsTable } from "./SshHostGroupHostsTable";

type Props = {
  sshHostGroupId: string;
};

export const SshHostGroupHostsSection = ({ sshHostGroupId }: Props) => {
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "removeHostFromSshHostGroup",
    "addHostGroupMembers",
    "upgradePlan"
  ] as const);

  const { mutateAsync: removeHostFromGroup } = useRemoveHostFromSshHostGroup();

  const handleAddSshHostModal = () => {
    if (!subscription?.sshHostGroups) {
      handlePopUpOpen("upgradePlan", {
        description:
          "You can manage hosts more efficiently with SSH host groups if you upgrade your Infisical plan to an Enterprise license."
      });
    } else {
      handlePopUpOpen("addHostGroupMembers", {
        sshHostGroupId
      });
    }
  };

  const onRemoveSshHostSubmit = async (sshHostId: string) => {
    try {
      await removeHostFromGroup({
        sshHostId,
        sshHostGroupId
      });

      await createNotification({
        text: "Successfully removed host from SSH group",
        type: "success"
      });

      handlePopUpClose("removeHostFromSshHostGroup");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to remove host from SSH group",
        type: "error"
      });
    }
  };

  return (
    <div className="h-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">SSH Hosts</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.SshHostGroups}
        >
          {(isAllowed) => (
            <IconButton
              ariaLabel="add host"
              variant="plain"
              className="group relative"
              onClick={() => handleAddSshHostModal()}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faPlus} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="py-4">
        <SshHostGroupHostsTable sshHostGroupId={sshHostGroupId} handlePopUpOpen={handlePopUpOpen} />
      </div>
      <AddHostGroupMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeHostFromSshHostGroup.isOpen}
        title={`Are you sure want to remove ${
          (popUp?.removeHostFromSshHostGroup?.data as { hostname: string; alias?: string })
            ?.alias ||
          (popUp?.removeHostFromSshHostGroup?.data as { hostname: string; alias?: string })
            ?.hostname ||
          ""
        } from this host group?`}
        onChange={(isOpen) => handlePopUpToggle("removeHostFromSshHostGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSshHostSubmit(
            (popUp?.removeHostFromSshHostGroup?.data as { sshHostId: string })?.sshHostId
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
