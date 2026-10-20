import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription as AlertContent,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Toggle,
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
import { useDeleteWorkspace, useLeaveProject, useUpdateProject } from "@app/hooks/api";
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
  const { mutateAsync: updateProject, isPending: isUpdatingDeleteProtection } = useUpdateProject();
  const hasDeleteProtection = currentProject?.hasDeleteProtection ?? false;

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

  const handleToggleDeleteProjectProtection = async (state: boolean) => {
    if (!currentProject) return;

    await updateProject({
      projectId: currentProject.id,
      hasDeleteProtection: state
    });

    createNotification({
      text: `Successfully ${state ? "enabled" : "disabled"} delete protection`,
      type: "success"
    });
  };

  const leaveButton = (
    <Button
      size="sm"
      isPending={isLeaving}
      isDisabled={!isDirectMember}
      variant="neutral"
      onClick={() => handlePopUpOpen("leaveWorkspace")}
    >
      {`Leave ${currentProject?.name}`}
    </Button>
  );

  const renderDeleteButton = (isAllowed: boolean) => {
    const isDisabled =
      !isAllowed || isDeleting || isUpdatingDeleteProtection || hasDeleteProtection;
    const deleteButton = (
      <Button
        size="sm"
        isPending={isDeleting}
        isDisabled={isDisabled}
        variant="danger"
        onClick={() => handlePopUpOpen("deleteWorkspace")}
      >
        <Trash2Icon />
        {`Delete ${currentProject?.name}`}
      </Button>
    );

    if (!isAllowed || (!hasDeleteProtection && !isUpdatingDeleteProtection)) return deleteButton;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper required so the tooltip explains why the inner button is disabled */}
          <span tabIndex={0}>{deleteButton}</span>
        </TooltipTrigger>
        <TooltipContent>
          {hasDeleteProtection
            ? "Disable delete protection before deleting this project."
            : "Updating delete protection."}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      <Card className="mb-6 gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">Delete Protection</CardTitle>
          <CardDescription>Prevent this project from being accidentally deleted.</CardDescription>
          <CardAction className="@xs:self-center">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Settings}
            >
              {(isAllowed) => (
                <Toggle
                  id="hasDeleteProtection"
                  variant="project"
                  checked={hasDeleteProtection}
                  disabled={!isAllowed || isUpdatingDeleteProtection}
                  aria-label="Toggle delete protection"
                  onCheckedChange={handleToggleDeleteProjectProtection}
                />
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardFooter className="min-h-8 border-t border-neutral/15 bg-neutral/5 p-4 pl-6">
          <p className="text-sm text-muted">
            {hasDeleteProtection
              ? "Delete protection is enabled. Disable it before deleting this project."
              : "Delete protection is disabled. This project can be deleted by members with permission."}
          </p>
        </CardFooter>
      </Card>

      <Card className="mb-6 gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">Leave Project</CardTitle>
          <CardDescription>Remove your access to this project and its contents.</CardDescription>
        </CardHeader>
        <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
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
        </CardFooter>
      </Card>

      <Card className="mb-6 gap-0 overflow-hidden border-danger/25 p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">Danger Zone</CardTitle>
          <CardDescription>Permanently delete this project and all of its data.</CardDescription>
        </CardHeader>
        <CardFooter className="min-h-8 justify-end border-t border-danger/15 bg-danger/5 p-4">
          <ProjectPermissionCan
            I={ProjectPermissionActions.Delete}
            a={ProjectPermissionSub.Project}
          >
            {renderDeleteButton}
          </ProjectPermissionCan>
        </CardFooter>
      </Card>

      <AlertDialog
        open={popUp.deleteWorkspace.isOpen}
        confirmationValue={CONFIRM_KEYWORD}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteWorkspace", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this project?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <Alert variant="danger" appearance="borderless">
                <AlertContent>
                  Permanently delete {currentProject?.name} and all of its data. This action is not
                  reversible.
                </AlertContent>
              </Alert>
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
            <AlertDialogTitle>Are you sure you want to leave this project?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <Alert variant="warning" appearance="borderless">
                <AlertContent>
                  Leaving {currentProject?.name} removes your access to the project and its
                  contents.
                </AlertContent>
              </Alert>
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
              variant="warning"
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
    </>
  );
};
