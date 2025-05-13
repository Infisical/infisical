import { faArrowUpRightFromSquare, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useDeleteSshHost } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshHostModal } from "./SshHostModal";
import { SshHostsTable } from "./SshHostsTable";

export const SshHostsSection = () => {
  const { mutateAsync: deleteSshHost } = useDeleteSshHost();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "sshHost",
    "deleteSshHost"
  ] as const);

  const onRemoveSshHostSubmit = async (sshHostId: string) => {
    try {
      const host = await deleteSshHost({ sshHostId });

      createNotification({
        text: `Successfully deleted SSH host: ${host.hostname}`,
        type: "success"
      });

      handlePopUpClose("deleteSshHost");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete SSH host",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Hosts</p>
        <div className="flex justify-end">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://infisical.com/docs/documentation/platform/ssh"
          >
            <span className="flex w-max cursor-pointer items-center rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
              Documentation{" "}
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.06rem] ml-1 text-xs"
              />
            </span>
          </a>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SshHosts}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("sshHost")}
                isDisabled={!isAllowed}
                className="ml-4"
              >
                Add Host
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
      <SshHostsTable handlePopUpOpen={handlePopUpOpen} />
      <SshHostModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteSshHost.isOpen}
        title="Are you sure you want to remove the SSH host?"
        onChange={(isOpen) => handlePopUpToggle("deleteSshHost", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSshHostSubmit((popUp?.deleteSshHost?.data as { sshHostId: string })?.sshHostId)
        }
      />
    </div>
  );
};
