import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, UpgradePlanModal } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { useDeleteGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { OrgGroupMembersModal } from "./OrgGroupMembersModal";
import { OrgGroupModal } from "./OrgGroupModal";
import { OrgGroupsTable } from "./OrgGroupsTable";

export const OrgGroupsSection = () => {
  const { subscription } = useSubscription();
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
        description:
          "You can manage users more efficiently with groups if you upgrade your Infisical plan."
      });
    } else {
      handlePopUpOpen("group");
    }
  };

  const onDeleteGroupSubmit = async ({ name, slug }: { name: string; slug: string }) => {
    try {
      await deleteMutateAsync({
        slug
      });
      createNotification({
        text: `Successfully deleted the group named ${name}`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to delete the group named ${name}`,
        type: "error"
      });
    }

    handlePopUpClose("deleteGroup");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">User Groups</p>
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Groups}>
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddGroupModal()}
              isDisabled={!isAllowed}
            >
              Create Group
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
      <OrgGroupMembersModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={`Are you sure want to delete the group named ${
          (popUp?.deleteGroup?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteGroupSubmit(popUp?.deleteGroup?.data as { name: string; slug: string })
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
