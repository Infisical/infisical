import { useMemo } from "react";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
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
    <Tr
      className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
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
      <Td className="max-w-0 truncate">{project.name}</Td>
      <Td>{`${formatProjectRoleName(roles[0].role, roles[0].customRoleName)}${
        roles.length > 1 ? ` (+${roles.length - 1})` : ""
      }`}</Td>
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
                  handlePopUpOpen("removeUserFromProject", {
                    username: user.username,
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
