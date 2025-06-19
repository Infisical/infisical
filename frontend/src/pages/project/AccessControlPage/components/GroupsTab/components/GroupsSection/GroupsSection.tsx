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
import { usePopUp } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";

import { GroupModal } from "./GroupModal";
import { GroupTable } from "./GroupsTable";

export const GroupsSection = () => {
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const { mutateAsync: deleteMutateAsync } = useDeleteGroupFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "group",
    "deleteGroup",
    "upgradePlan"
  ] as const);

  const handleAddGroupModal = () => {
    if (!subscription?.groups) {
      handlePopUpOpen("upgradePlan", {
        description:
          "You can manage users more efficiently with groups if you upgrade your Infisical plan to an Enterprise license."
      });
    } else {
      handlePopUpOpen("group");
    }
  };

  const onRemoveGroupSubmit = async (groupId: string) => {
    try {
      await deleteMutateAsync({
        groupId,
        projectId: currentWorkspace?.id || ""
      });

      createNotification({
        text: "Successfully removed identity from project",
        type: "success"
      });

      handlePopUpClose("deleteGroup");
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to remove group from project";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">User Groups</p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Groups}>
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddGroupModal()}
              isDisabled={!isAllowed}
            >
              Add Group
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
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </div>
  );
};
