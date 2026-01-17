import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDeleteGroupFromWorkspace as useRemoveProjectFromGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddGroupProjectModal } from "../AddGroupProjectModal";
import { GroupProjectsTable } from "./GroupProjectsTable";

type Props = {
  groupId: string;
  groupSlug: string;
};

export const GroupProjectsSection = ({ groupId, groupSlug }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addGroupProjects",
    "removeProjectFromGroup"
  ] as const);

  const { mutateAsync: removeProjectFromGroupMutateAsync } = useRemoveProjectFromGroup();

  const handleRemoveProjectFromGroup = async (projectId: string, projectName: string) => {
    await removeProjectFromGroupMutateAsync({
      groupId,
      projectId
    });

    createNotification({
      text: `Successfully removed the group from project ${projectName}`,
      type: "success"
    });

    handlePopUpToggle("removeProjectFromGroup", false);
  };

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Projects</UnstableCardTitle>
          <UnstableCardDescription>Manage group project memberships</UnstableCardDescription>
          <UnstableCardAction>
            <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed}
                  onClick={() => {
                    handlePopUpOpen("addGroupProjects", {
                      groupId,
                      slug: groupSlug
                    });
                  }}
                  size="xs"
                  variant="outline"
                >
                  <PlusIcon />
                  Add to Project
                </Button>
              )}
            </OrgPermissionCan>
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <GroupProjectsTable
            groupId={groupId}
            groupSlug={groupSlug}
            handlePopUpOpen={handlePopUpOpen}
          />
        </UnstableCardContent>
      </UnstableCard>
      <AddGroupProjectModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeProjectFromGroup.isOpen}
        title={`Are you sure you want to remove the group from ${
          (popUp?.removeProjectFromGroup?.data as { projectName: string })?.projectName || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeProjectFromGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const projectData = popUp?.removeProjectFromGroup?.data as {
            projectId: string;
            projectName: string;
          };

          return handleRemoveProjectFromGroup(projectData.projectId, projectData.projectName);
        }}
      />
    </>
  );
};
