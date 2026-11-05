import { type ReactNode } from "react";
import { format } from "date-fns";
import { ChevronRightIcon, Ellipsis, HourglassIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
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
import { cn } from "@app/components/v3/utils";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { OrgPermissionAdminConsoleAction } from "@app/context/OrgPermissionContext/types";
import { getProjectLucideIcon, getProjectTitle } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import {
  useGetDeletedProjects,
  usePermanentlyDeleteProject,
  useRestoreProject
} from "@app/hooks/api";
import { DeletedProject, ProjectType } from "@app/hooks/api/projects/types";
import {
  formatRemainingDuration,
  getActorLabel
} from "@app/pages/secret-manager/SettingsPage/components/EnvironmentSection/EnvironmentTable";

const CONFIRM_KEYWORD = "confirm";

// The rows join the projects table, so they span the same columns.
const PROJECT_TABLE_COLUMN_COUNT = 5;

const PendingDeletionBadge = ({
  project,
  children
}: {
  project: DeletedProject;
  children: ReactNode;
}) => {
  const deleteAfterDate = new Date(project.deleteAfter);
  const remaining = formatRemainingDuration(deleteAfterDate);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning">
          <HourglassIcon />
          {children}
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
            Soft-deleted by {getActorLabel(project.deletedBy)} ·{" "}
            {format(new Date(project.softDeletedAt), "MMM d, yyyy")}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

const DeletedProjectRow = ({
  project,
  actions
}: {
  project: DeletedProject;
  actions: ReactNode;
}) => {
  const ProjectIcon = getProjectLucideIcon(project.type);
  const remaining = formatRemainingDuration(new Date(project.deleteAfter));

  return (
    <TableRow>
      <TableCell className="w-0">
        <div className="inline-flex shrink-0 items-center justify-center rounded-sm border border-dashed border-border p-1">
          <ProjectIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
        </div>
      </TableCell>
      <TableCell isTruncatable className="text-muted line-through">
        {project.name}
      </TableCell>
      <TableCell isTruncatable className="text-xs text-muted">
        Deleted {format(new Date(project.softDeletedAt), "MMM d, yyyy")}
      </TableCell>
      <TableCell className="w-0">
        <PendingDeletionBadge project={project}>
          {remaining ? `Deletes in ${remaining}` : "Deleting Soon"}
        </PendingDeletionBadge>
      </TableCell>
      <TableCell className="w-0 text-right">{actions}</TableCell>
    </TableRow>
  );
};

const DeletedProjectCard = ({
  project,
  actions
}: {
  project: DeletedProject;
  actions: ReactNode;
}) => {
  const ProjectIcon = getProjectLucideIcon(project.type);
  const remaining = formatRemainingDuration(new Date(project.deleteAfter));

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-sm border border-dashed border-border p-2">
            <ProjectIcon className="size-5.5 shrink-0 text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base text-muted">
              <span className="min-w-0 truncate line-through">{project.name}</span>
            </CardTitle>
            <p className="truncate text-sm leading-5 text-muted">{getProjectTitle(project.type)}</p>
          </div>
        </div>
        <CardAction>{actions}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex">
          <PendingDeletionBadge project={project}>
            {remaining ? `Pending Deletion · ${remaining} left` : "Pending Deletion"}
          </PendingDeletionBadge>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-dashed border-border pt-3 text-xs text-muted">
          <span>
            Deleted{" "}
            <span className="font-medium text-accent">
              {format(new Date(project.softDeletedAt), "MMM d, yyyy")}
            </span>
          </span>
          <span className="truncate">
            By <span className="font-medium text-accent">{getActorLabel(project.deletedBy)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

type Props = {
  projectType: ProjectType;
  searchFilter: string;
  // "table-rows" joins the caller's projects table; "table" brings its own for when there is none.
  layout: "table-rows" | "table" | "grid";
  // Owned by the caller because the group remounts whenever the list reloads or changes layout.
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
};

export const RecentlyDeletedProjects = ({
  projectType,
  searchFilter,
  layout,
  isExpanded,
  onExpandedChange
}: Props) => {
  const { permission } = useOrgPermission();
  const canAccessAllProjects = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );
  // Only Secrets Management projects get a restore grace period; other types are deleted outright.
  const isRestorable = projectType === ProjectType.SecretManager;

  const {
    data: deletedProjects = [],
    isError,
    refetch
  } = useGetDeletedProjects(projectType, {
    enabled: canAccessAllProjects && isRestorable
  });
  const restoreProject = useRestoreProject();
  const permanentlyDeleteProject = usePermanentlyDeleteProject();
  const isMutationPending = restoreProject.isPending || permanentlyDeleteProject.isPending;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "restoreProject",
    "permanentlyDeleteProject"
  ] as const);

  const restoreProjectData = popUp?.restoreProject?.data as
    | { id: string; name: string }
    | undefined;

  const permanentlyDeleteProjectData = popUp?.permanentlyDeleteProject?.data as
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

  const onProjectPermanentlyDeleteSubmit = async () => {
    if (!permanentlyDeleteProjectData?.id || permanentlyDeleteProject.isPending) return;

    await permanentlyDeleteProject.mutateAsync({ projectId: permanentlyDeleteProjectData.id });

    createNotification({
      text: "Successfully deleted project",
      type: "success"
    });

    handlePopUpClose("permanentlyDeleteProject");
  };

  const projects = deletedProjects.filter(({ name }) =>
    name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  if (!canAccessAllProjects || !isRestorable || (!isError && !projects.length)) return null;

  const renderActions = ({ id, name }: DeletedProject) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isMutationPending}>
        <IconButton
          aria-label={`Options for ${name}`}
          variant="ghost-muted"
          size="xs"
          isDisabled={isMutationPending}
        >
          <Ellipsis />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handlePopUpOpen("restoreProject", { id, name })}>
          <RotateCcwIcon />
          Restore Project
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="danger"
          onClick={() => handlePopUpOpen("permanentlyDeleteProject", { id, name })}
        >
          <Trash2Icon />
          Delete Now
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const disclosureLabel = (
    <>
      <ChevronRightIcon
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-accent transition-transform duration-200 ease-in-out motion-reduce:transition-none",
          isExpanded && "rotate-90"
        )}
      />
      <span className="font-medium text-label">Recently Deleted</span>
      {!isError && <Badge variant="neutral">{projects.length}</Badge>}
      <span className="truncate text-muted">Restorable for 14 days after deletion</span>
    </>
  );

  const loadError = (
    <div className="flex items-center gap-3 text-xs text-muted">
      Deleted projects could not be loaded.
      <Button variant="outline" size="xs" onClick={() => refetch()}>
        Retry
      </Button>
    </div>
  );

  const dialogs = (
    <>
      <AlertDialog
        isPending={restoreProject.isPending}
        open={popUp.restoreProject.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("restoreProject", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {restoreProjectData?.name ?? "project"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The project will become accessible again with its secrets, environments, and history
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
      <AlertDialog
        isPending={permanentlyDeleteProject.isPending}
        open={popUp.permanentlyDeleteProject.isOpen}
        confirmationValue={CONFIRM_KEYWORD}
        onOpenChange={(isOpen) => handlePopUpToggle("permanentlyDeleteProject", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently Delete {permanentlyDeleteProjectData?.name ?? "project"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <Alert variant="danger" appearance="borderless">
                <AlertDescription>
                  Skip the rest of the grace period and permanently delete{" "}
                  {permanentlyDeleteProjectData?.name} and all of its data. This action is not
                  reversible.
                </AlertDescription>
              </Alert>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            inputProps={{ placeholder: `Type ${CONFIRM_KEYWORD} here` }}
            onConfirm={() => onProjectPermanentlyDeleteSubmit().catch(() => undefined)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={(event) => {
                event.preventDefault();
                onProjectPermanentlyDeleteSubmit().catch(() => undefined);
              }}
            >
              Delete Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (layout === "grid") {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => onExpandedChange(!isExpanded)}
          className="flex cursor-pointer items-center gap-2 rounded-sm text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {disclosureLabel}
          <span aria-hidden className="ml-2 h-px flex-1 bg-border" />
        </button>
        {isExpanded &&
          (isError ? (
            loadError
          ) : (
            <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
              {projects.map((project) => (
                <DeletedProjectCard
                  key={project.id}
                  project={project}
                  actions={renderActions(project)}
                />
              ))}
            </div>
          ))}
        {dialogs}
      </div>
    );
  }

  const rows = (
    <>
      <TableRow>
        <TableCell colSpan={PROJECT_TABLE_COLUMN_COUNT} className="p-0">
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => onExpandedChange(!isExpanded)}
            className="flex h-10 w-full cursor-pointer items-center gap-2 px-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {disclosureLabel}
          </button>
        </TableCell>
      </TableRow>
      {isExpanded &&
        (isError ? (
          <TableRow>
            <TableCell colSpan={PROJECT_TABLE_COLUMN_COUNT}>{loadError}</TableCell>
          </TableRow>
        ) : (
          projects.map((project) => (
            <DeletedProjectRow
              key={project.id}
              project={project}
              actions={renderActions(project)}
            />
          ))
        ))}
    </>
  );

  if (layout === "table") {
    return (
      <>
        <Table>
          <TableBody>{rows}</TableBody>
        </Table>
        {dialogs}
      </>
    );
  }

  return (
    <>
      {rows}
      {dialogs}
    </>
  );
};
