import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InfoIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  OrgPermissionGroupActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useDeleteGroup, useUnlinkGroupFromOrganization } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { OrgGroupLinkForm } from "./OrgGroupLinkForm";
import { OrgGroupModal } from "./OrgGroupModal";
import { OrgGroupsTable } from "./OrgGroupsTable";

enum GroupWizardSteps {
  CreateNew = "create-new",
  AssignExisting = "assign-existing"
}

export const OrgGroupsSection = () => {
  const { subscription } = useSubscription();
  const { isSubOrganization } = useOrganization();
  const { mutateAsync: deleteMutateAsync } = useDeleteGroup();
  const { mutateAsync: unlinkGroup } = useUnlinkGroupFromOrganization();
  const [wizardStep, setWizardStep] = useState<GroupWizardSteps>(GroupWizardSteps.CreateNew);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "group",
    "groupMembers",
    "deleteGroup",
    "upgradePlan",
    "addGroup",
    "unlinkGroup"
  ] as const);

  const handleAddGroupModal = () => {
    if (!subscription?.groups) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not allow adding groups. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
    } else if (isSubOrganization) {
      setWizardStep(GroupWizardSteps.CreateNew);
      handlePopUpOpen("addGroup");
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

  const onUnlinkGroupSubmit = async ({
    name,
    groupId,
    organizationId
  }: {
    name: string;
    groupId: string;
    organizationId: string;
  }) => {
    await unlinkGroup({ organizationId, groupId });
    createNotification({
      text: `Successfully removed group ${name} from sub-organization`,
      type: "success"
    });
    handlePopUpClose("unlinkGroup");
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
      <OrgGroupsTable
        handlePopUpOpen={handlePopUpOpen}
        onUnlinkGroup={async (data) => {
          handlePopUpOpen("unlinkGroup", data);
        }}
      />
      <OrgGroupModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      {isSubOrganization && (
        <Modal
          isOpen={popUp.addGroup.isOpen}
          onOpenChange={(open) => {
            handlePopUpToggle("addGroup", open);
            if (!open) setWizardStep(GroupWizardSteps.CreateNew);
          }}
        >
          <ModalContent
            bodyClassName="overflow-visible"
            title="Add Group to Sub-Organization"
            subTitle="Create a new group or assign an existing one from your parent organization"
          >
            <div className="mb-4 flex items-center justify-center gap-x-2">
              <div className="flex w-3/4 gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
                <Button
                  variant="outline_bg"
                  onClick={() => setWizardStep(GroupWizardSteps.CreateNew)}
                  size="xs"
                  className={twMerge(
                    "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                    wizardStep === GroupWizardSteps.CreateNew ? "bg-mineshaft-500" : "bg-transparent"
                  )}
                >
                  Create New
                </Button>
                <Button
                  variant="outline_bg"
                  onClick={() => setWizardStep(GroupWizardSteps.AssignExisting)}
                  size="xs"
                  className={twMerge(
                    "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                    wizardStep === GroupWizardSteps.AssignExisting
                      ? "bg-mineshaft-500"
                      : "bg-transparent"
                  )}
                >
                  Assign Existing
                </Button>
              </div>
              <Tooltip
                className="max-w-sm"
                position="right"
                align="start"
                content={
                  <>
                    <p className="mb-2 text-mineshaft-300">
                      You can add groups to your sub-organization in one of two ways:
                    </p>
                    <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                      <li className="text-mineshaft-200">
                        <strong className="font-medium text-mineshaft-100">Create New</strong> –
                        Create a new group for this sub-organization.
                      </li>
                      <li>
                        <strong className="font-medium text-mineshaft-100">Assign Existing</strong> –
                        Link an existing group from your parent organization.
                      </li>
                    </ul>
                  </>
                }
              >
                <InfoIcon size={16} className="text-mineshaft-400" />
              </Tooltip>
            </div>
            {wizardStep === GroupWizardSteps.CreateNew && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-mineshaft-400">
                  Create a new group that will be managed in this sub-organization.
                </p>
                <Button
                  variant="outline_bg"
                  onClick={() => {
                    handlePopUpClose("addGroup");
                    handlePopUpOpen("group");
                  }}
                >
                  Continue to Create Group
                </Button>
              </div>
            )}
            {wizardStep === GroupWizardSteps.AssignExisting && (
              <OrgGroupLinkForm onClose={() => handlePopUpClose("addGroup")} />
            )}
          </ModalContent>
        </Modal>
      )}
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
      <DeleteActionModal
        isOpen={popUp.unlinkGroup.isOpen}
        title={`Remove group from sub-organization?`}
        subTitle={
          (popUp?.unlinkGroup?.data as { name: string })?.name
            ? `This will remove "${
                (popUp?.unlinkGroup?.data as { name: string })?.name
              }" from this sub-organization. The group will remain in the parent organization.`
            : ""
        }
        onChange={(isOpen) => handlePopUpToggle("unlinkGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onUnlinkGroupSubmit(
            popUp?.unlinkGroup?.data as {
              name: string;
              groupId: string;
              organizationId: string;
            }
          )
        }
        buttonText="Remove from sub-organization"
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
