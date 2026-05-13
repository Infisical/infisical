import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

import { GroupModal } from "./GroupModal";
import { GroupTable } from "./GroupsTable";

export const GroupsSection = () => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const productLabel = isCertManager ? "Certificate Manager" : "Project";

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
      projectId: currentProject?.id || "",
      projectType: currentProject?.type
    });

    createNotification({
      text: `Successfully removed group from ${productLabel.toLowerCase()}`,
      type: "success"
    });

    handlePopUpClose("deleteGroup");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {isCertManager ? "Groups" : `${productLabel} Groups`}
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/groups#user-groups" />
          </CardTitle>
          <CardDescription>{`Add and manage ${productLabel.toLowerCase()} groups`}</CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Groups}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  onClick={() => handleAddGroupModal()}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  {isCertManager ? "Add Group" : `Add Group to ${productLabel}`}
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <GroupModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
          <GroupTable handlePopUpOpen={handlePopUpOpen} />
        </CardContent>
      </Card>
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={`Are you sure you want to remove the group ${
          (popUp?.deleteGroup?.data as { name: string })?.name || ""
        } from the ${productLabel.toLowerCase()}?`}
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
    </>
  );
};
