import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";

import { GroupModal } from "./GroupModal";
import { GroupTable } from "./GroupsTable";

export const GroupsSection = () => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();

  const { mutateAsync: deleteMutateAsync } = useDeleteGroupFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "group",
    "deleteGroup",
    "upgradePlan"
  ] as const);

  const handleAddGroupModal = () => {
    if (!subscription?.groups) {
      handlePopUpOpen("upgradePlan", {
        text: "Managing groups can be unlocked if you upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
    } else {
      handlePopUpOpen("group");
    }
  };

  const onRemoveGroupSubmit = async (groupId: string) => {
    await deleteMutateAsync({
      groupId,
      projectId: currentProject?.id || ""
    });

    createNotification({
      text: "Successfully removed identity from project",
      type: "success"
    });

    handlePopUpClose("deleteGroup");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <p className="text-xl font-medium text-mineshaft-100">Project Groups</p>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/groups#user-groups" />
        </div>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Groups}>
          {(isAllowed) => (
            <Button
              variant="outline_bg"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddGroupModal()}
              isDisabled={!isAllowed}
            >
              Add Group to Project
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <GroupModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <GroupTable handlePopUpOpen={handlePopUpOpen} />
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={`Are you sure you want to remove the group ${
          (popUp?.deleteGroup?.data as { name: string })?.name || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveGroupSubmit((popUp?.deleteGroup?.data as { id: string })?.id)
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
