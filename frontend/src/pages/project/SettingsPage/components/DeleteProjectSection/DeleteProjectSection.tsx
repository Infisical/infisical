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
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldContent,
  FieldLabel,
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
    <Card className="mb-6 gap-0 overflow-hidden border-danger/25 p-0">
      <CardHeader className="p-6">
        <CardTitle className="font-alliance">Danger Zone</CardTitle>
        <CardDescription>
          Manage delete protection, permanently delete this project, or leave it.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
          {(isAllowed) => (
            <Field
              orientation="horizontal"
              data-disabled={!isAllowed || isUpdatingDeleteProtection}
              className="items-start"
            >
              <Checkbox
                id="hasDeleteProtection"
                variant="project"
                isDisabled={!isAllowed || isUpdatingDeleteProtection}
                isChecked={hasDeleteProtection}
                onCheckedChange={(state) => {
                  if (state !== "indeterminate") {
                    handleToggleDeleteProjectProtection(state);
                  }
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="hasDeleteProtection" size="sm">
                  Protect this project from accidental deletion. Disable this setting before you can
                  delete the project.
                </FieldLabel>
              </FieldContent>
            </Field>
          )}
        </ProjectPermissionCan>
      </CardContent>
      <CardFooter className="min-h-8 justify-end gap-2 border-t border-danger/15 bg-danger/5 p-4">
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
        <ProjectPermissionCan I={ProjectPermissionActions.Delete} a={ProjectPermissionSub.Project}>
          {renderDeleteButton}
        </ProjectPermissionCan>
      </CardFooter>

      <AlertDialog
        open={popUp.deleteWorkspace.isOpen}
        confirmationValue={CONFIRM_KEYWORD}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteWorkspace", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this project?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <Alert variant="danger">
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
              <Alert variant="warning">
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
    </Card>
  );
};
