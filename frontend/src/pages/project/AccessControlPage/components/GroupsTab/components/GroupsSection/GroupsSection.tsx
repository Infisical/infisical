import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

import { GroupModal } from "./GroupModal";
import { GroupTable } from "./GroupsTable";

export const GroupsSection = () => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  // Products without an intermediate project view read as a product, not a project, so they drop
  // the "Project" wording. Behavioural forks below stay on isCertManager.
  const isStandaloneProduct = isCertManager || currentProject?.type === ProjectType.AgentVault;
  const productLabel =
    isStandaloneProduct && currentProject ? getProjectTitle(currentProject.type) : "Project";

  const { mutateAsync: deleteMutateAsync, isPending: isRemovingGroup } =
    useDeleteGroupFromWorkspace();

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
    try {
      await deleteMutateAsync({
        groupId,
        projectId: currentProject?.id || "",
        projectType: currentProject?.type
      });
    } catch {
      return;
    }

    createNotification({
      text: `Successfully removed group from ${productLabel.toLowerCase()}`,
      type: "success"
    });

    handlePopUpClose("deleteGroup");
  };

  const groupToRemove = popUp.deleteGroup.data as { id?: string; name?: string } | undefined;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {isStandaloneProduct ? "Groups" : `${productLabel} Groups`}
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
                  {isStandaloneProduct ? "Add Group" : `Add Group to ${productLabel}`}
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
      <DeleteConfirmDialog
        isOpen={popUp.deleteGroup.isOpen}
        onOpenChange={(isOpen) => {
          if (!isRemovingGroup) handlePopUpToggle("deleteGroup", isOpen);
        }}
        title={`Remove "${groupToRemove?.name}" from ${productLabel}?`}
        description={`This removes the group's access to this ${productLabel.toLowerCase()}. You can add the group again later.`}
        confirmKey={groupToRemove?.name ?? ""}
        confirmLabel="Remove Group"
        isPending={isRemovingGroup}
        onConfirm={async () => {
          if (groupToRemove?.id) await onRemoveGroupSubmit(groupToRemove.id);
        }}
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
