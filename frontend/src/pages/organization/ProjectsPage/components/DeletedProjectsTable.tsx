import { format } from "date-fns";
import { Ellipsis, HourglassIcon, RotateCcwIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { OrgPermissionAdminConsoleAction } from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useGetDeletedProjects, useRestoreProject } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  formatRemainingDuration,
  getActorLabel
} from "@app/pages/secret-manager/SettingsPage/components/EnvironmentSection/EnvironmentTable";

export const DeletedProjectsTable = ({ projectType }: { projectType: ProjectType }) => {
  const { permission } = useOrgPermission();
  const canAccessAllProjects = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );

  const { data: deletedProjects = [] } = useGetDeletedProjects(projectType, {
    enabled: canAccessAllProjects
  });
  const restoreProject = useRestoreProject();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "restoreProject"
  ] as const);

  const restoreProjectData = popUp?.restoreProject?.data as
    | { id: string; name: string }
    | undefined;

  const onProjectRestoreSubmit = async () => {
    if (!restoreProjectData?.id || restoreProject.isPending) return;

    await restoreProject.mutateAsync({ projectId: restoreProjectData.id });

    createNotification({
      text: "Successfully restored project",
      type: "success"
    });

    handlePopUpClose("restoreProject");
  };

  if (!canAccessAllProjects || !deletedProjects.length) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Recently Deleted</CardTitle>
        <CardDescription>
          Deleted projects can be restored until they are permanently deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {deletedProjects.map(({ id, name, deleteAfter, softDeletedAt, deletedBy }) => {
              const deleteAfterDate = new Date(deleteAfter);
              const remaining = formatRemainingDuration(deleteAfterDate);

              return (
                <TableRow key={id}>
                  <TableCell className="text-warning/80 line-through">{name}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="warning">
                            <HourglassIcon />
                            Pending Deletion
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-foreground">
                              {remaining
                                ? `${remaining} until permanent deletion`
                                : "Will be permanently deleted soon"}
                            </span>
                            <span className="text-xs text-accent">
                              {remaining
                                ? `Scheduled for ${format(deleteAfterDate, "MMM d, yyyy, h:mm a")}`
                                : "Awaiting the next cleanup sweep"}
                            </span>
                            <span className="text-xs text-accent">
                              Soft-deleted by {getActorLabel(deletedBy)} ·{" "}
                              {format(new Date(softDeletedAt), "MMM d, yyyy")}
                            </span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild disabled={restoreProject.isPending}>
                          <IconButton
                            aria-label="Project options"
                            variant="ghost-muted"
                            isDisabled={restoreProject.isPending}
                          >
                            <Ellipsis />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handlePopUpOpen("restoreProject", { id, name })}
                          >
                            <RotateCcwIcon />
                            Restore Project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <AlertDialog
        open={popUp.restoreProject.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && restoreProject.isPending) return;
          handlePopUpToggle("restoreProject", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {restoreProjectData?.name ?? "project"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The project will become accessible again with its secrets, environments, and history
              preserved. Its slug was released on deletion, so it gets a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={restoreProject.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="project"
              size="sm"
              onClick={() => onProjectRestoreSubmit().catch(() => undefined)}
              isPending={restoreProject.isPending}
            >
              Restore Project
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
