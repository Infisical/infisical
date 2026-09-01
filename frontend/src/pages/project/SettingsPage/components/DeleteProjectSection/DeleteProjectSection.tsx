import { useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { useToggle } from "@app/hooks";
import { useDeleteWorkspace, useLeaveProject } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

const CONFIRM_KEYWORD = "confirm";

export const DeleteProjectSection = () => {
  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteWorkspace",
    "leaveWorkspace"
  ] as const);

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { memberships } = useProjectPermission();
  const isDirectMember = Boolean(memberships?.some((membership) => !membership.actorGroupId));
  const [isDeleting, setIsDeleting] = useToggle();
  const [isLeaving, setIsLeaving] = useToggle();
  const deleteWorkspace = useDeleteWorkspace();
  const leaveProject = useLeaveProject();

  const handleDeleteWorkspaceSubmit = async () => {
    setIsDeleting.on();
    try {
      if (!currentProject?.id) return;

      await deleteWorkspace.mutateAsync({
        projectID: currentProject?.id
      });

      createNotification({
        text: "Successfully deleted project",
        type: "success"
      });

      navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: currentOrg.id }
      });
      handlePopUpClose("deleteWorkspace");
    } finally {
      setIsDeleting.off();
    }
  };

  const handleLeaveWorkspaceSubmit = async () => {
    try {
      if (!currentProject) return;

      setIsLeaving.on();

      await leaveProject.mutateAsync({
        projectId: currentProject.id
      });

      navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: currentOrg.id }
      });
      handlePopUpClose("leaveWorkspace");
    } finally {
      setIsLeaving.off();
    }
  };

  const leaveButton = (
    <Button
      isPending={isLeaving}
      isDisabled={!isDirectMember}
      variant="danger"
      onClick={() => handlePopUpOpen("leaveWorkspace")}
    >
      {`Leave ${currentProject?.name}`}
    </Button>
  );

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <TriangleAlert className="size-4 text-danger" />
          Danger Zone
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        <ProjectPermissionCan I={ProjectPermissionActions.Delete} a={ProjectPermissionSub.Project}>
          {(isAllowed) => (
            <Button
              isPending={isDeleting}
              isDisabled={!isAllowed}
              variant="danger"
              onClick={() => handlePopUpOpen("deleteWorkspace")}
            >
              {`Delete ${currentProject?.name}`}
            </Button>
          )}
        </ProjectPermissionCan>
        {isDirectMember ? (
          leaveButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper required so the tooltip explains why the inner button is disabled */}
              <span tabIndex={0}>{leaveButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              You&apos;re a member through a group. Leave the group to remove access.
            </TooltipContent>
          </Tooltip>
        )}
      </CardContent>

      <AlertDialog
        open={popUp.deleteWorkspace.isOpen}
        confirmationValue={CONFIRM_KEYWORD}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteWorkspace", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlert className="text-danger" />
            </AlertDialogMedia>
            <AlertDialogTitle>Are you sure you want to delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {currentProject?.name} and all of its data. This action is not
              reversible, so please be careful.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            inputProps={{ placeholder: `Type ${CONFIRM_KEYWORD} here` }}
            onConfirm={() => {
              if (!isDeleting) handleDeleteWorkspaceSubmit();
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteWorkspaceSubmit();
              }}
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={popUp.leaveWorkspace.isOpen}
        confirmationValue={CONFIRM_KEYWORD}
        onOpenChange={(isOpen) => handlePopUpToggle("leaveWorkspace", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlert className="text-danger" />
            </AlertDialogMedia>
            <AlertDialogTitle>Are you sure you want to leave this project?</AlertDialogTitle>
            <AlertDialogDescription>
              If you leave {currentProject?.name} you will lose access to the project and its
              contents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            inputProps={{ placeholder: `Type ${CONFIRM_KEYWORD} here` }}
            onConfirm={() => {
              if (!isLeaving) handleLeaveWorkspaceSubmit();
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isLeaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isLeaving}
              onClick={(event) => {
                event.preventDefault();
                handleLeaveWorkspaceSubmit();
              }}
            >
              Leave Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
