import { PlusIcon } from "lucide-react";

import { GroupsUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
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
  ConfirmationAlertDialog,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { getProjectLabel, hidesProjects } from "@app/helpers/project";
import { usePopUp, useScopeVariant } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";

import { GroupModal } from "./GroupModal";
import { GroupTable } from "./GroupsTable";

export const GroupsSection = () => {
  const scopeVariant = useScopeVariant();
  const { subscription } = useSubscription();
  const { currentProject } = useProject();
  const productLabel = getProjectLabel(currentProject?.type);
  const projectsHidden = hidesProjects(currentProject?.type);

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
            {projectsHidden ? "Groups" : `${productLabel} Groups`}
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
                  variant={scopeVariant}
                  onClick={() => handleAddGroupModal()}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  {projectsHidden ? "Add Group" : `Add Group to ${productLabel}`}
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
      <ConfirmationAlertDialog
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
      <UpgradeGate
        paywallKey="project.groups"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={{
          ...GroupsUpgradeIntent,
          isEnterpriseFeature: Boolean(popUp.upgradePlan?.data?.isEnterpriseFeature)
        }}
      />
    </>
  );
};
