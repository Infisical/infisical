import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { MoreHorizontalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectBaseURL, getProjectTitle } from "@app/helpers/project";
import { useGetUserProjects } from "@app/hooks/api";
import { TGroupProject } from "@app/hooks/api/groups/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  project: TGroupProject;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeProjectFromGroup"]>,
    data?: object
  ) => void;
};

export const GroupProjectRow = ({ project, handlePopUpOpen }: Props) => {
  const { data: workspaces } = useGetUserProjects();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const isAccessible = useMemo(() => {
    const workspaceIds = new Map();

    workspaces?.forEach((workspace) => {
      workspaceIds.set(workspace.id, true);
    });

    return workspaceIds.has(project.id);
  }, [workspaces, project]);

  return (
    <TableRow
      key={`group-project-${project.id}`}
      onClick={() => {
        if (isAccessible) {
          navigate({
            to: `${getProjectBaseURL(project.type as ProjectType)}/access-management` as const,
            params: {
              orgId: currentOrg?.id || "",
              projectId: project.id
            },
            search: {
              selectedTab: "groups"
            }
          });
          return;
        }

        createNotification({
          text: "Unable to access project",
          type: "error"
        });
      }}
    >
      <TableCell className="max-w-0 truncate">{project.name}</TableCell>
      <TableCell>{getProjectTitle(project.type as ProjectType)}</TableCell>
      <TableCell>{format(new Date(project.joinedGroupAt), "yyyy-MM-dd")}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <IconButton variant="ghost" size="xs">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              isDisabled={!isAccessible}
              onClick={(e) => {
                e.stopPropagation();
                navigate({
                  to: `${getProjectBaseURL(project.type as ProjectType)}/access-management` as const,
                  params: {
                    orgId: currentOrg?.id || "",
                    projectId: project.id
                  },
                  search: {
                    selectedTab: "groups"
                  }
                });
              }}
            >
              Access Project
            </DropdownMenuItem>
            <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
              {(isAllowed) => (
                <DropdownMenuItem
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("removeProjectFromGroup", {
                      projectId: project.id,
                      projectName: project.name
                    });
                  }}
                >
                  Remove From Project
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
