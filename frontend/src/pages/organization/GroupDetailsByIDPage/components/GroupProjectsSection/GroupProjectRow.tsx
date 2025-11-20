import { faEllipsisV, faFolderMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { TGroupProject } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  project: TGroupProject;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeProjectFromGroup"]>,
    data?: object
  ) => void;
};

export const GroupProjectRow = ({ project, handlePopUpOpen }: Props) => {
  return (
    <Tr className="items-center" key={`group-project-${project.id}`}>
      <Td>
        <p>{project.name}</p>
      </Td>
      <Td>
        <p className="capitalize">{project.type?.replace("-", " ") || "-"}</p>
      </Td>
      <Td>
        <Tooltip content={new Date(project.joinedGroupAt).toLocaleString()}>
          <p>{new Date(project.joinedGroupAt).toLocaleDateString()}</p>
        </Tooltip>
      </Td>
      <Td>
        <Tooltip className="max-w-sm text-center" content="Options">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Options"
                colorSchema="secondary"
                className="w-6"
                variant="plain"
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
                {(isAllowed) => {
                  return (
                    <DropdownMenuItem
                      icon={<FontAwesomeIcon icon={faFolderMinus} />}
                      onClick={() =>
                        handlePopUpOpen("removeProjectFromGroup", {
                          projectId: project.id,
                          projectName: project.name
                        })
                      }
                      isDisabled={!isAllowed}
                    >
                      Remove Project From Group
                    </DropdownMenuItem>
                  );
                }}
              </OrgPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
