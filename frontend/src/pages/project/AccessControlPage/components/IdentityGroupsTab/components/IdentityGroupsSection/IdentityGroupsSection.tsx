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
import { useDeleteIdentityGroupFromWorkspace } from "@app/hooks/api";

import { IdentityGroupModal } from "./IdentityGroupModal";
import { IdentityGroupsTable } from "./IdentityGroupsTable";

export const IdentityGroupsSection = () => {
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const { mutateAsync: deleteMutateAsync } = useDeleteIdentityGroupFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "group",
    "deleteIdentityGroup",
    "upgradePlan"
  ] as const);

  const handleAddGroupModal = () => {
    if (!subscription?.identityGroups) {
      handlePopUpOpen("upgradePlan", {
        description:
          "You can manage machine identities more efficiently with identity groups if you upgrade your Infisical plan to an Enterprise license."
      });
    } else {
      handlePopUpOpen("group");
    }
  };

  const onRemoveGroupSubmit = async (identityGroupId: string) => {
    try {
      await deleteMutateAsync({
        identityGroupId,
        projectId: currentWorkspace?.id || ""
      });

      createNotification({
        text: "Successfully removed identity from project",
        type: "success"
      });

      handlePopUpClose("deleteIdentityGroup");
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to remove identity group from project";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Identity Groups</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.IdentityGroups}
        >
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddGroupModal()}
              isDisabled={!isAllowed}
            >
              Add Identity Group
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <IdentityGroupModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <IdentityGroupsTable handlePopUpOpen={handlePopUpOpen} />
      <DeleteActionModal
        isOpen={popUp.deleteIdentityGroup.isOpen}
        title={`Are you sure you want to remove the identity group ${
          (popUp?.deleteIdentityGroup?.data as { name: string })?.name || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteIdentityGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveGroupSubmit((popUp?.deleteIdentityGroup?.data as { id: string })?.id)
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
