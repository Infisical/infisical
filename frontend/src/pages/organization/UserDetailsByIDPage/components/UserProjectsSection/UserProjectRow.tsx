import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableTableCell,
  UnstableTableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useGetUserProjects } from "@app/hooks/api";
import { TWorkspaceUser } from "@app/hooks/api/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { OrgAccessControlTabSections } from "@app/types/org";

type Props = {
  membership: TWorkspaceUser;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeUserFromProject"]>,
    data?: object
  ) => void;
};

export const UserProjectRow = ({
  membership: { id, project, user, roles },
  handlePopUpOpen
}: Props) => {
  const { data: workspaces = [] } = useGetUserProjects();
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
    <UnstableTableRow
      key={`user-project-membership-${id}`}
      onClick={() => {
        if (isAccessible) {
          navigate({
            to: `${getProjectBaseURL(project.type)}/access-management` as const,
            params: {
              orgId: currentOrg?.id || "",
              projectId: project.id
            },
            search: {
              selectedTab: OrgAccessControlTabSections.Member
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
      <UnstableTableCell className="max-w-0 truncate">{project.name}</UnstableTableCell>
      <UnstableTableCell>{`${formatProjectRoleName(roles[0].role, roles[0].customRoleName)}${
        roles.length > 1 ? ` (+${roles.length - 1})` : ""
      }`}</UnstableTableCell>
      <UnstableTableCell>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger>
            <UnstableIconButton variant="ghost" size="xs">
              <MoreHorizontalIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <UnstableDropdownMenuItem
              isDisabled={!isAccessible}
              onClick={(e) => {
                e.stopPropagation();
                navigate({
                  to: `${getProjectBaseURL(project.type)}/access-management` as const,
                  params: {
                    orgId: currentOrg?.id || "",
                    projectId: project.id
                  },
                  search: {
                    selectedTab: OrgAccessControlTabSections.Member
                  }
                });
              }}
            >
              Access Project
            </UnstableDropdownMenuItem>
            <UnstableDropdownMenuItem
              variant="danger"
              isDisabled={!isAccessible}
              onClick={(e) => {
                e.stopPropagation();
                handlePopUpOpen("removeUserFromProject", {
                  username: user.username,
                  projectId: project.id,
                  projectName: project.name
                });
              }}
            >
              Remove From Project
            </UnstableDropdownMenuItem>
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
