import { format, intervalToDuration } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Ellipsis,
  HourglassIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { useRestoreEnvironment, useUpdateWsEnvironment } from "@app/hooks/api";
import { ProjectDeletedEnvActor } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type PopUpKeys = "updateEnv" | "deleteEnv" | "hardDeleteEnv" | "upgradePlan";

type EnvPayload = { name: string; slug: string; id: string; deleteAfter?: string };

type Props = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<[PopUpKeys]>, env: EnvPayload) => void;
};

const getActorLabel = (actor: ProjectDeletedEnvActor | null): string => {
  if (!actor) return "Someone";
  if (actor.type === "identity") return actor.name || "An identity";

  return actor.firstName || actor.username || actor.email || "A user";
};

const formatRemainingDuration = (target: Date): string | null => {
  const now = new Date();
  if (target.getTime() <= now.getTime()) return null;

  const duration = intervalToDuration({ start: now, end: target });
  const parts: Array<[number | undefined, string]> = [
    [duration.years, "y"],
    [duration.months, "mo"],
    [duration.days, "d"],
    [duration.hours, "h"],
    [duration.minutes, "m"]
  ];

  const nonZero = parts.filter(([value]) => value && value > 0).slice(0, 2);
  if (nonZero.length === 0) return "<1m";

  return nonZero.map(([value, suffix]) => `${value}${suffix}`).join(" ");
};

export const EnvironmentTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();

  const updateEnvironment = useUpdateWsEnvironment();
  const restoreEnvironment = useRestoreEnvironment();

  const activeEnvironments = currentProject.environments ?? [];
  const deletedEnvironments = currentProject.deletedEnvironments ?? [];

  const handleReorderEnv = async (id: string, position: number) => {
    if (!currentProject?.id) return;

    await updateEnvironment.mutateAsync({
      projectId: currentProject.id,
      id,
      position
    });

    createNotification({
      text: "Successfully re-ordered environments",
      type: "success"
    });
  };

  const handleRestoreEnv = async (id: string) => {
    if (!currentProject?.id) return;

    try {
      await restoreEnvironment.mutateAsync({
        projectId: currentProject.id,
        id
      });

      createNotification({
        text: "Successfully restored environment",
        type: "success"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore environment";
      createNotification({
        text: message,
        type: "error"
      });
    }
  };

  const isMoreEnvironmentsAllowed =
    subscription?.environmentLimit && activeEnvironments
      ? activeEnvironments.length <= subscription.environmentLimit
      : true;

  const environmentsOverPlanLimit =
    subscription?.environmentLimit && activeEnvironments
      ? Math.max(0, activeEnvironments.length - subscription.environmentLimit)
      : 0;

  if (!activeEnvironments.length && !deletedEnvironments.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No environments found</EmptyTitle>
          <EmptyDescription>
            Create your first environment to organize secrets by stage.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activeEnvironments.map(({ name, slug, id }, pos) => (
          <TableRow key={id}>
            <TableCell>{name}</TableCell>
            <TableCell>{slug}</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <IconButton
                      aria-label="Move down"
                      variant="ghost-muted"
                      onClick={() =>
                        handleReorderEnv(id, Math.min(activeEnvironments.length, pos + 2))
                      }
                      isDisabled={pos === activeEnvironments.length - 1 || !isAllowed}
                    >
                      <ArrowDownIcon />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <IconButton
                      aria-label="Move up"
                      variant="ghost-muted"
                      onClick={() => handleReorderEnv(id, Math.max(1, pos))}
                      isDisabled={pos === 0 || !isAllowed}
                    >
                      <ArrowUpIcon />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton aria-label="Environment options" variant="ghost-muted">
                      <Ellipsis />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={ProjectPermissionSub.Environments}
                    >
                      {(isAllowed) => (
                        <Tooltip open={!isMoreEnvironmentsAllowed ? undefined : false}>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              isDisabled={!isAllowed || !isMoreEnvironmentsAllowed}
                              onClick={() => handlePopUpOpen("updateEnv", { name, slug, id })}
                            >
                              <PencilIcon />
                              Edit environment
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            You have exceeded the number of environments allowed by your plan. To
                            edit an existing environment, either upgrade your plan or remove at
                            least {environmentsOverPlanLimit} environment
                            {environmentsOverPlanLimit === 1 ? "" : "s"}.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </ProjectPermissionCan>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={ProjectPermissionSub.Environments}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          variant="danger"
                          isDisabled={!isAllowed}
                          onClick={() => handlePopUpOpen("deleteEnv", { name, slug, id })}
                        >
                          <Trash2Icon />
                          Delete environment
                        </DropdownMenuItem>
                      )}
                    </ProjectPermissionCan>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {deletedEnvironments.map(({ name, slug, id, deleteAfter, softDeletedAt, deletedBy }) => {
          const deleteAfterDate = new Date(deleteAfter);
          const remaining = formatRemainingDuration(deleteAfterDate);

          return (
            <TableRow key={id} className="bg-warning/[0.025]">
              <TableCell className="text-mineshaft-400 line-through">{name}</TableCell>
              <TableCell className="text-mineshaft-400">{slug}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="warning">
                        <HourglassIcon />
                        Pending deletion
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-foreground">
                          {remaining
                            ? `${remaining} until permanent deletion`
                            : "Will be permanently deleted soon"}
                        </span>
                        <span className="text-xs text-mineshaft-300">
                          {remaining
                            ? `Scheduled for ${format(deleteAfterDate, "MMM d, yyyy, h:mm a")}`
                            : "Awaiting the next daily cleanup sweep"}
                        </span>
                        <span className="text-xs text-mineshaft-300">
                          Soft-deleted by {getActorLabel(deletedBy)} ·{" "}
                          {format(new Date(softDeletedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={ProjectPermissionSub.Environments}
                  >
                    {(isAllowed) => (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild disabled={!isAllowed}>
                          <IconButton
                            aria-label="Environment options"
                            variant="ghost-muted"
                            isDisabled={!isAllowed}
                          >
                            <Ellipsis />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRestoreEnv(id)}>
                            <RotateCcwIcon />
                            Restore environment
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() =>
                              handlePopUpOpen("hardDeleteEnv", { name, slug, id, deleteAfter })
                            }
                          >
                            <Trash2Icon />
                            Delete permanently
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </ProjectPermissionCan>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
