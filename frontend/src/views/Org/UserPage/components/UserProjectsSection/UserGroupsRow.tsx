/* eslint-disable react/jsx-no-useless-fragment */
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { TGroupWithProjectMemberships } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  group: TGroupWithProjectMemberships;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromGroup"]>, data?: {}) => void;
};

export const UserGroupsRow = ({ group, handlePopUpOpen }: Props) => {
  return (
    <>
      <Tr
        className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        key={`user-project-membership-${group.id}`}
      >
        <Td>{group.name}</Td>
        <Td>
          <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Tooltip content="Unassign user from group">
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
        </Td>
      </Tr>
    </>
  );
};
