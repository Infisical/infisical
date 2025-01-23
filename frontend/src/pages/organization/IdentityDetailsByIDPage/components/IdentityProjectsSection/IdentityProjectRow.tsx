import { useMemo } from "react";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { IconButton, Tag, Td, Tooltip, Tr } from "@app/components/v2";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { IdentityMembership } from "@app/hooks/api/identities/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

export enum TabSections {
  Member = "members",
  Groups = "groups",
  Roles = "roles",
  Identities = "identities"
}

type Props = {
  membership: IdentityMembership;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIdentityFromProject"]>,
    data?: object
  ) => void;
};

const formatRoleName = (role: string, customRoleName?: string) => {
  if (role === ProjectMembershipRole.Custom) return customRoleName;
  if (role === ProjectMembershipRole.Admin) return "Admin";
  if (role === ProjectMembershipRole.Member) return "Developer";
  if (role === ProjectMembershipRole.Viewer) return "Viewer";
  if (role === ProjectMembershipRole.NoAccess) return "No Access";
  return role;
};

export const IdentityProjectRow = ({
  membership: { id, createdAt, identity, project, roles },
  handlePopUpOpen
}: Props) => {
  const { data: workspaces } = useGetUserWorkspaces();
  const navigate = useNavigate();

  const isAccessible = useMemo(() => {
    const workspaceIds = new Map();

    workspaces?.forEach((workspace) => {
      workspaceIds.set(workspace.id, true);
    });

    return workspaceIds.has(project.id);
  }, [workspaces, project]);

  return (
    <Tr
      className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
      key={`identity-project-membership-${id}`}
      onClick={() => {
        if (isAccessible) {
          navigate({
            to: `/${project?.type}/$projectId/access-management` as const,
            params: {
              projectId: project.id
            },
            search: {
              selectedTab: TabSections.Identities
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
      <Td className="max-w-0 truncate">{project.name}</Td>
      <Td>
        <Tag size="xs">{project.type}</Tag>
      </Td>
      <Td>{`${formatRoleName(roles[0].role, roles[0].customRoleName)}${
        roles.length > 1 ? ` (+${roles.length - 1})` : ""
      }`}</Td>
      <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
      <Td>
        {isAccessible && (
          <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Tooltip content="Remove">
              <IconButton
                colorSchema="danger"
                ariaLabel="copy icon"
                variant="plain"
                className="group relative"
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
                <FontAwesomeIcon icon={faTrash} />
              </IconButton>
            </Tooltip>
          </div>
        )}
      </Td>
    </Tr>
  );
};
