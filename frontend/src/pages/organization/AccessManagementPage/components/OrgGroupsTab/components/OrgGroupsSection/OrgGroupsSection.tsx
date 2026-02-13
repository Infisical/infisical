import { useState } from "react";
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

import { GroupWizardSteps } from "./groupWizardSteps";
import { OrgGroupModal } from "./OrgGroupModal";
import { OrgGroupsTable } from "./OrgGroupsTable";

export { GroupWizardSteps };

export const OrgGroupsSection = () => {
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { mutateAsync: deleteMutateAsync } = useDeleteGroup();
  const [wizardStep, setWizardStep] = useState<GroupWizardSteps>(GroupWizardSteps.CreateGroup);

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
      if (!isSubOrganization) {
        setWizardStep(GroupWizardSteps.CreateGroup);
      }
      handlePopUpOpen("group");
    }
  };

  const onDeleteGroupSubmit = async ({
    name,
    groupId,
    isLinkedGroup
  }: {
    name: string;
    groupId: string;
    isLinkedGroup?: boolean;
  }) => {
    await deleteMutateAsync({
      id: groupId,
      organizationId: currentOrg?.id
    });
    createNotification({
      text: isLinkedGroup
        ? "Successfully unlinked group from sub-organization"
        : `Successfully deleted the group named ${name}`,
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
              {isSubOrganization
                ? "Add Group to Sub-Organization"
                : `Create ${isSubOrganization ? "Sub-" : ""}Organization Group`}
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <OrgGroupsTable handlePopUpOpen={handlePopUpOpen} />
      <OrgGroupModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        isSubOrganization={isSubOrganization}
      />
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={
          (popUp?.deleteGroup?.data as { name: string; isLinkedGroup?: boolean })?.isLinkedGroup
            ? `Are you sure you want to unlink the group "${
                (popUp?.deleteGroup?.data as { name: string })?.name || ""
              }" from this sub-organization?`
            : `Are you sure you want to delete the group named ${
                (popUp?.deleteGroup?.data as { name: string })?.name || ""
              }?`
        }
        onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteGroupSubmit(
            popUp?.deleteGroup?.data as { name: string; groupId: string; isLinkedGroup?: boolean }
          )
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
