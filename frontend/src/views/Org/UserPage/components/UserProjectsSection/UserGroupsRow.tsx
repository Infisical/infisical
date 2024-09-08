/* eslint-disable react/jsx-no-useless-fragment */
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { TGroupWithProjectMemberships } from "@app/hooks/api/groups/types";
import { OrgUser } from "@app/hooks/api/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserGroupsProjectsModalData } from "./UserGroupProjectsModal";

type Props = {
  group: TGroupWithProjectMemberships;
  orgMembership: OrgUser;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeUserFromGroup", "userGroupsProjects"]>,
    data?: {}
  ) => void;
};

export const UserGroupsRow = ({ group, orgMembership, handlePopUpOpen }: Props) => {
  return (
    <>
      <Tr
        className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        key={`user-project-membership-${group.id}`}
        onClick={() => {
          handlePopUpOpen("userGroupsProjects", {
            groupSlug: group.slug,
            username: orgMembership.user.username,
            group
          } as UserGroupsProjectsModalData);
        }}
      >
        <Td>{group.name}</Td>
        <Td>
          {group.projectMemberships.length} Project
          {group.projectMemberships.length > 1 || group.projectMemberships.length === 0 ? "s" : ""}
        </Td>
        <Td>
          {true && (
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content="Remove user from group">
                <IconButton
                  colorSchema="danger"
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("removeUserFromGroup", {
                      groupSlug: group.slug
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
    </>
  );
};
