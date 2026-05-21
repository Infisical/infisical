import { ArrowDownIcon, ArrowUpIcon, PencilIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
import { useUpdateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["updateEnv", "deleteEnv", "upgradePlan"]>,
    {
      name,
      slug,
      id
    }: {
      name: string;
      slug: string;
      id: string;
    }
  ) => void;
};

export const EnvironmentTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();

  const updateEnvironment = useUpdateWsEnvironment();

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

  const isMoreEnvironmentsAllowed =
    subscription?.environmentLimit && currentProject?.environments
      ? currentProject.environments.length <= subscription.environmentLimit
      : true;

  const environmentsOverPlanLimit =
    subscription?.environmentLimit && currentProject?.environments
      ? Math.max(0, currentProject.environments.length - subscription.environmentLimit)
      : 0;

  if (!currentProject.environments?.length) {
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
        {currentProject.environments.map(({ name, slug, id }, pos) => (
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
                        handleReorderEnv(id, Math.min(currentProject.environments.length, pos + 2))
                      }
                      isDisabled={pos === currentProject.environments.length - 1 || !isAllowed}
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
      </TableBody>
    </Table>
  );
};
