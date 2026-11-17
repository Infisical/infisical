import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { MoreHorizontalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { useIsNamedByProduct } from "@app/components/organization/ProductAccess";
import { OrgPermissionCan } from "@app/components/permissions";
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
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  getInstancePinningLink,
  getProjectBaseURL,
  getProjectLucideIcon,
  getProjectTitle
} from "@app/helpers/project";
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
  const { currentOrg } = useOrganization();

  const isAccessible = useMemo(() => {
    const workspaceIds = new Map();

    workspaces?.forEach((workspace) => {
      workspaceIds.set(workspace.id, true);
    });

    return workspaceIds.has(project.id);
  }, [workspaces, project]);

  const projectType = project.type as ProjectType;
  const productName = getProjectTitle(projectType);
  const ProductIcon = getProjectLucideIcon(projectType);
  const isNamedByProduct = useIsNamedByProduct()(projectType);
  const membershipLabel = isNamedByProduct ? productName : project.name;

  const projectLink =
    getInstancePinningLink(
      currentOrg.id,
      { id: project.id, type: project.type as ProjectType },
      "access-management"
    ) ??
    ({
      to: `${getProjectBaseURL(project.type as ProjectType)}/access-management`,
      params: { orgId: currentOrg.id, projectId: project.id }
    } as const);
  const projectSearch = { selectedTab: "groups" };

  return (
    <TableRow
      key={`group-project-${project.id}`}
      linked={isAccessible}
      onClick={
        isAccessible
          ? undefined
          : () => createNotification({ text: `Unable to access ${membershipLabel}`, type: "error" })
      }
    >
      <TableCell className="max-w-0 truncate">
        <RowLink {...projectLink} search={projectSearch} disabled={!isAccessible}>
          <span className="flex min-w-0 items-center gap-2">
            <ProductIcon className="size-4 shrink-0 text-muted" />
            <span className="truncate">{productName}</span>
          </span>
        </RowLink>
      </TableCell>
      <TableCell className="max-w-0 truncate">
        {isNamedByProduct ? <span className="text-muted">-</span> : project.name}
      </TableCell>
      <TableCell>{format(new Date(project.joinedGroupAt), "yyyy-MM-dd")}</TableCell>
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
                {isNamedByProduct ? `Open ${productName}` : "Open Project"}
              </Link>
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
                      projectType: project.type,
                      projectName: membershipLabel
                    });
                  }}
                >
                  {isNamedByProduct ? `Remove From ${productName}` : "Remove From Project"}
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
