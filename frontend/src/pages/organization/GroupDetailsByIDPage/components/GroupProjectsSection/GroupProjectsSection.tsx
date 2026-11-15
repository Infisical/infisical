import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { AddToProductDialog } from "@app/components/organization/ProductAccess";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import {
  useAddGroupToWorkspace,
  useDeleteGroupFromWorkspace as useRemoveProjectFromGroup,
  useListGroupProjects
} from "@app/hooks/api";
import { FilterReturnedProjects } from "@app/hooks/api/groups/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { GroupProjectsTable } from "./GroupProjectsTable";

type Props = {
  groupId: string;
  hideAddToProject?: boolean;
};

export const GroupProjectsSection = ({ groupId, hideAddToProject = false }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addGroupToProduct",
    "removeProjectFromGroup"
  ] as const);

  const { mutateAsync: removeProjectFromGroupMutateAsync } = useRemoveProjectFromGroup();
  const { mutateAsync: addGroupToProject } = useAddGroupToWorkspace();

  // The listing caps a page at 100, so a group in more projects may be offered one it already has;
  // the server refuses that add and the dialog reports it.
  const {
    data: assignedProjects,
    isPending: isAssignedProjectsLoading,
    isError: isAssignedProjectsError
  } = useListGroupProjects({
    id: groupId,
    offset: 0,
    limit: 100,
    search: "",
    filter: FilterReturnedProjects.ASSIGNED_PROJECTS
  });

  const handleRemoveProjectFromGroup = async (
    projectId: string,
    projectType: string,
    projectName: string
  ) => {
    await removeProjectFromGroupMutateAsync({
      groupId,
      projectId,
      projectType
    });

    createNotification({
      text: `Successfully removed the group from ${projectName}`,
      type: "success"
    });

    handlePopUpToggle("removeProjectFromGroup", false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Manage the products and projects this group can access</CardDescription>
          <CardAction>
            {!hideAddToProject && (
              <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
                {(isAllowed) => (
                  <Button
                    isDisabled={!isAllowed}
                    onClick={() => {
                      handlePopUpOpen("addGroupToProduct");
                    }}
                    size="xs"
                    variant="outline"
                  >
                    <PlusIcon />
                    Add to Product
                  </Button>
                )}
              </OrgPermissionCan>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <GroupProjectsTable
            groupId={groupId}
            handlePopUpOpen={handlePopUpOpen}
            hideAddToProject={hideAddToProject}
          />
        </CardContent>
      </Card>
      <AddToProductDialog
        isOpen={popUp.addGroupToProduct.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addGroupToProduct", isOpen)}
        title="Add Group to Product"
        actorLabel="group"
        memberProjectIds={assignedProjects?.projects.map(({ id }) => id)}
        isMembershipsLoading={isAssignedProjectsLoading}
        isMembershipsError={isAssignedProjectsError}
        onAddToProject={(project, roleSlug) =>
          addGroupToProject({
            groupId,
            projectId: project.id,
            projectType: project.type,
            role: roleSlug
          })
        }
      />
      <ConfirmationAlertDialog
        isOpen={popUp.removeProjectFromGroup.isOpen}
        title={`Are you sure you want to remove the group from ${
          (popUp?.removeProjectFromGroup?.data as { projectName: string })?.projectName || ""
        }?`}
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("removeProjectFromGroup", isOpen)}
        confirmKey="confirm"
        onConfirm={() => {
          const projectData = popUp?.removeProjectFromGroup?.data as {
            projectId: string;
            projectType: string;
            projectName: string;
          };

          return handleRemoveProjectFromGroup(
            projectData.projectId,
            projectData.projectType,
            projectData.projectName
          );
        }}
      />
    </>
  );
};
