import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useRemoveHostFromSshHostGroup } from "@app/hooks/api";

import { AddHostGroupMemberModal } from "./AddHostGroupMemberModal";
import { SshHostGroupHostsTable } from "./SshHostGroupHostsTable";

type Props = {
  sshHostGroupId: string;
};

export const SshHostGroupHostsSection = ({ sshHostGroupId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "removeHostFromSshHostGroup",
    "addHostGroupMembers"
  ] as const);

  const { mutateAsync: removeHostFromGroup } = useRemoveHostFromSshHostGroup();

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
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.SshHosts}>
          {(isAllowed) => (
            <IconButton
              ariaLabel="add host"
              variant="plain"
              className="group relative"
              onClick={() =>
                handlePopUpOpen("addHostGroupMembers", {
                  sshHostGroupId
                })
              }
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
        title={`Are you sure want to remove the host ${
          (popUp?.removeHostFromSshHostGroup?.data as { hostname: string })?.hostname || ""
        } from this SSH group?`}
        onChange={(isOpen) => handlePopUpToggle("removeHostFromSshHostGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSshHostSubmit(
            (popUp?.removeHostFromSshHostGroup?.data as { sshHostId: string })?.sshHostId
          )
        }
      />
    </div>
  );
};
