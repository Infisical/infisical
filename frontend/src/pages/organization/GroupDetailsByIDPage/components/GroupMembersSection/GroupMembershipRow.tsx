import { faUserMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { TGroupUser } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  user: TGroupUser;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup"]>,
    data?: object
  ) => void;
};

export const GroupMembershipRow = ({
  user: { firstName, lastName, username, joinedGroupAt, email, id },
  handlePopUpOpen
}: Props) => {
  return (
    <Tr className="items-center" key={`group-user-${id}`}>
      <Td>
        <p>{`${firstName ?? "-"} ${lastName ?? ""}`}</p>
      </Td>
      <Td>
        <p>{email}</p>
      </Td>
      <Td>
        <Tooltip content={new Date(joinedGroupAt).toLocaleString()}>
          <p>{new Date(joinedGroupAt).toLocaleDateString()}</p>
        </Tooltip>
      </Td>
      <Td className="justify-end">
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Groups}>
          {(isAllowed) => {
            return (
              <Tooltip content="Remove user from group">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="Remove user from group"
                  onClick={() => handlePopUpOpen("removeMemberFromGroup", { username })}
                  variant="plain"
                  colorSchema="danger"
                >
                  <FontAwesomeIcon icon={faUserMinus} className="cursor-pointer" />
                </IconButton>
              </Tooltip>
            );
          }}
        </OrgPermissionCan>
      </Td>
    </Tr>
  );
};
