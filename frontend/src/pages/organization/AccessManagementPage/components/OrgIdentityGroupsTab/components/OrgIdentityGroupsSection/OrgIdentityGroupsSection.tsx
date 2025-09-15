import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  OrgPermissionIdentityGroupActions,
  OrgPermissionSubjects,
  useSubscription
} from "@app/context";
import { useDeleteIdentityGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { OrgIdentityGroupModal } from "./OrgIdentityGroupModal";
import { OrgIdentityGroupsTable } from "./OrgIdentityGroupsTable";

export const OrgIdentityGroupsSection = () => {
  const { subscription } = useSubscription();
  const { mutateAsync: deleteMutateAsync } = useDeleteIdentityGroup();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "identityGroup",
    "identityGroupMembers",
    "deleteIdentityGroup",
    "upgradePlan"
  ] as const);

  const handleAddIdentityGroupModal = () => {
    if (!subscription?.identityGroups) {
      handlePopUpOpen("upgradePlan", {
        description:
          "You can manage machine identities more efficiently with identity groups if you upgrade your Infisical plan to an Enterprise license."
      });
    } else {
      handlePopUpOpen("identityGroup");
    }
  };

  const onDeleteIdentityGroupSubmit = async ({
    name,
    identityGroupId
  }: {
    name: string;
    identityGroupId: string;
  }) => {
    try {
      await deleteMutateAsync({
        id: identityGroupId
      });
      createNotification({
        text: `Successfully deleted the identity group named ${name}`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to delete the identity group named ${name}`,
        type: "error"
      });
    }

    handlePopUpClose("deleteIdentityGroup");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Identity Groups</p>
        <OrgPermissionCan
          I={OrgPermissionIdentityGroupActions.Create}
          a={OrgPermissionSubjects.IdentityGroups}
        >
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handleAddIdentityGroupModal()}
              isDisabled={!isAllowed}
            >
              Create Identity Group
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <OrgIdentityGroupsTable handlePopUpOpen={handlePopUpOpen} />
      <OrgIdentityGroupModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteIdentityGroup.isOpen}
        title={`Are you sure you want to delete the identity group named ${
          (popUp?.deleteIdentityGroup?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteIdentityGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteIdentityGroupSubmit(
            popUp?.deleteIdentityGroup?.data as { name: string; identityGroupId: string }
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
