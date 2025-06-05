import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useSubscription,
  useWorkspace
} from "@app/context";
import { useDeleteTrustedIp } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { IPAllowlistModal } from "./IPAllowlistModal";
import { IPAllowlistTable } from "./IPAllowlistTable";

export const IPAllowlistSection = () => {
  const { mutateAsync } = useDeleteTrustedIp();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "trustedIp",
    "deleteTrustedIp",
    "upgradePlan"
  ] as const);

  const onDeleteTrustedIpSubmit = async (trustedIpId: string) => {
    try {
      if (!currentWorkspace?.id) return;

      await mutateAsync({
        workspaceId: currentWorkspace.id,
        trustedIpId
      });

      createNotification({
        text: "Successfully deleted IP access range",
        type: "success"
      });

      handlePopUpClose("deleteTrustedIp");
    } catch (err) {
      console.log(err);
      createNotification({
        text: "Failed to delete IP access range",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-8 flex items-center">
        <h2 className="flex-1 text-xl font-semibold text-white">IP Allowlist</h2>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.IpAllowList}
        >
          {(isAllowed) => (
            <Button
              onClick={() => {
                if (subscription?.ipAllowlisting) {
                  handlePopUpOpen("trustedIp");
                } else {
                  handlePopUpOpen("upgradePlan");
                }
              }}
              colorSchema="secondary"
              isLoading={false}
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              Add IP
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <IPAllowlistTable
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <IPAllowlistModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteTrustedIp.isOpen}
        title={`Are you sure you want to delete ${
          (popUp?.deleteTrustedIp?.data as { name: string })?.name || " "
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteTrustedIp", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteTrustedIpSubmit(
            (popUp?.deleteTrustedIp?.data as { trustedIpId: string })?.trustedIpId
          )
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can use IP allowlisting if you switch to Infisical's Pro plan."
      />
    </div>
  );
};
