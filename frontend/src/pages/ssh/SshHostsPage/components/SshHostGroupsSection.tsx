import { faArrowUpRightFromSquare, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useSubscription } from "@app/context";
import { useDeleteSshHostGroup } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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
    if (!subscription?.get(SubscriptionProductCategory.PAM, "sshHostGroups")) {
      handlePopUpOpen("upgradePlan", {
        text: "Managing SSH host groups can be unlocked if you upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
    } else {
      handlePopUpOpen("sshHostGroup");
    }
  };

  const onRemoveSshHostGroupSubmit = async (sshHostGroupId: string) => {
    const hostGroup = await deleteSshHostGroup({ sshHostGroupId });

    createNotification({
      text: `Successfully deleted SSH host group: ${hostGroup.name}`,
      type: "success"
    });

    handlePopUpClose("deleteSshHostGroup");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-medium text-mineshaft-100">Host Groups</p>
        <div className="flex justify-end">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://infisical.com/docs/documentation/platform/ssh/host-groups"
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
            a={ProjectPermissionSub.SshHostGroups}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="button"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handleAddSshHostGroupModal()}
                isDisabled={!isAllowed}
                className="ml-4"
              >
                Add Group
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
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
        text={popUp.upgradePlan?.data?.text}
        isEnterpriseFeature={popUp.upgradePlan?.data?.isEnterpriseFeature}
      />
    </div>
  );
};
