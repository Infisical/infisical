import { format } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  HourglassIcon,
  MoreVerticalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon
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
import { useRestoreWsEnvironment, useUpdateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type PopUpKeys = "updateEnv" | "deleteEnv" | "hardDeleteEnv" | "upgradePlan";

type EnvPayload = { name: string; slug: string; id: string; expireAfter?: string };

type Props = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<[PopUpKeys]>, env: EnvPayload) => void;
};

export const EnvironmentTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();

  const updateEnvironment = useUpdateWsEnvironment();
  const restoreEnvironment = useRestoreWsEnvironment();

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
          <TableHead className="text-right">Actions</TableHead>
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
                      size="xs"
                      onClick={() =>
                        handleReorderEnv(id, Math.min(activeEnvironments.length, pos + 2))
                      }
                      isDisabled={pos === activeEnvironments.length - 1 || !isAllowed}
                    >
                      <ArrowDownIcon className="size-4" />
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
                      size="xs"
                      onClick={() => handleReorderEnv(id, Math.max(1, pos))}
                      isDisabled={pos === 0 || !isAllowed}
                    >
                      <ArrowUpIcon className="size-4" />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <IconButton
                            aria-label="Edit environment"
                            variant="ghost-muted"
                            size="xs"
                            onClick={() => {
                              handlePopUpOpen("updateEnv", { name, slug, id });
                            }}
                            isDisabled={!isAllowed || !isMoreEnvironmentsAllowed}
                          >
                            <PencilIcon className="size-4" />
                          </IconButton>
                        </span>
                      </TooltipTrigger>
                      {!isMoreEnvironmentsAllowed && (
                        <TooltipContent>
                          You have exceeded the number of environments allowed by your plan. To edit
                          an existing environment, either upgrade your plan or remove at least{" "}
                          {environmentsOverPlanLimit} environment
                          {environmentsOverPlanLimit === 1 ? "" : "s"}.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <IconButton
                      aria-label="Delete environment"
                      variant="danger"
                      size="xs"
                      onClick={() => {
                        handlePopUpOpen("deleteEnv", { name, slug, id });
                      }}
                      isDisabled={!isAllowed}
                    >
                      <XIcon className="size-4" />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {deletedEnvironments.map(({ name, slug, id, expireAfter }) => (
          <TableRow key={id} className="bg-warning/[0.025]">
            <TableCell className="text-mineshaft-400 line-through">{name}</TableCell>
            <TableCell className="text-mineshaft-400">{slug}</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="warning">
                      <HourglassIcon className="size-3" />
                      Pending deletion
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Will be permanently deleted on{" "}
                    {format(new Date(expireAfter), "MMM d, yyyy 'at' h:mm a")}
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
                          size="xs"
                          isDisabled={!isAllowed}
                        >
                          <MoreVerticalIcon className="size-4" />
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
                            handlePopUpOpen("hardDeleteEnv", { name, slug, id, expireAfter })
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
        ))}
      </TableBody>
    </Table>
  );
};
