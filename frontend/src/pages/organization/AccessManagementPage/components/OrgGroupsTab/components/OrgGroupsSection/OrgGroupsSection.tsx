import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  OrgPermissionGroupActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useDeleteGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { OrgGroupModal } from "./OrgGroupModal";
import { OrgGroupsTable } from "./OrgGroupsTable";

export const OrgGroupsSection = () => {
  const { subscription } = useSubscription();
  const { isSubOrganization } = useOrganization();
  const { mutateAsync: deleteMutateAsync } = useDeleteGroup();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "group",
    "groupMembers",
    "deleteGroup",
    "upgradePlan"
  ] as const);

  const handleAddGroupModal = () => {
    if (!subscription?.groups) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not allow adding groups. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
    } else {
      handlePopUpOpen("group");
    }
  };

  const onDeleteGroupSubmit = async ({ name, groupId }: { name: string; groupId: string }) => {
    await deleteMutateAsync({
      id: groupId
    });
    createNotification({
      text: `Successfully deleted the group named ${name}`,
      type: "success"
    });

    handlePopUpClose("deleteGroup");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-x-2">
          <p className="text-xl font-medium text-mineshaft-100">
            {isSubOrganization ? "Sub-" : ""}Organization Groups
          </p>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/groups" />
        </div>
        <OrgPermissionCan I={OrgPermissionGroupActions.Create} a={OrgPermissionSubjects.Groups}>
          {(isAllowed) => (
            <Button
              variant="outline_bg"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddGroupModal()}
              isDisabled={!isAllowed}
            >
              Create {isSubOrganization ? "Sub-" : ""}Organization Group
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <OrgGroupsTable handlePopUpOpen={handlePopUpOpen} />
      <OrgGroupModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={`Are you sure you want to delete the group named ${
          (popUp?.deleteGroup?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteGroupSubmit(popUp?.deleteGroup?.data as { name: string; groupId: string })
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        text={popUp.upgradePlan?.data?.text}
      />
    </div>
  );
};
