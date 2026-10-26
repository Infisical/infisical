import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { MoreHorizontalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  RowLink,
  TableCell,
  TableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { getInstancePinningLink, getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useGetUserProjects } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

export enum TabSections {
  Member = "members",
  Groups = "groups",
  Roles = "roles",
  Identities = "identities"
}

type Props = {
  membership: IdentityProjectMembershipV1;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIdentityFromProject"]>,
    data?: object
  ) => void;
};

export const IdentityProjectRow = ({
  membership: { id, createdAt, identity, project, roles },
  handlePopUpOpen
}: Props) => {
  const { data: workspaces } = useGetUserProjects();
  const { currentOrg } = useOrganization();

  const isAccessible = useMemo(() => {
    const workspaceIds = new Map();

    workspaces?.forEach((workspace) => {
      workspaceIds.set(workspace.id, true);
    });

    return workspaceIds.has(project.id);
  }, [workspaces, project]);

  const projectLink =
    getInstancePinningLink(
      currentOrg.id,
      { id: project.id, type: project.type },
      "access-management"
    ) ??
    ({
      to: `${getProjectBaseURL(project.type)}/access-management`,
      params: { orgId: currentOrg.id, projectId: project.id }
    } as const);
  const projectSearch = { selectedTab: TabSections.Identities };

  return (
    <TableRow
      key={`identity-project-membership-${id}`}
      linked={isAccessible}
      onClick={
        isAccessible
          ? undefined
          : () => createNotification({ text: "Unable to access project", type: "error" })
      }
    >
      <TableCell className="max-w-0 truncate">
        <RowLink {...projectLink} search={projectSearch} disabled={!isAccessible}>
          {project.name}
        </RowLink>
      </TableCell>
      <TableCell>{`${formatProjectRoleName(roles[0].role, roles[0].customRoleName)}${
        roles.length > 1 ? ` (+${roles.length - 1})` : ""
      }`}</TableCell>
      <TableCell>{format(new Date(createdAt), "yyyy-MM-dd")}</TableCell>
      <TableCell data-row-interactive>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <IconButton variant="ghost" size="xs">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild isDisabled={!isAccessible}>
              <Link {...projectLink} search={projectSearch}>
                Access Project
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="danger"
              isDisabled={!isAccessible}
              onClick={(e) => {
                e.stopPropagation();
                handlePopUpOpen("removeIdentityFromProject", {
                  identityId: identity.id,
                  identityName: identity.name,
                  projectId: project.id,
                  projectName: project.name
                });
              }}
            >
              Remove From Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
