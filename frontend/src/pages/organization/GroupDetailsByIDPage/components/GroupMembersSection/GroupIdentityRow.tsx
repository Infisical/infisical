import { faEllipsisV, faUserMinus } from "@fortawesome/free-solid-svg-icons";
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
import { TGroupIdentity } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identity: TGroupIdentity;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup"]>,
    data?: object
  ) => void;
};

export const GroupIdentityRow = ({
  identity: { id, name, joinedGroupAt },
  handlePopUpOpen
}: Props) => {
  if (!joinedGroupAt) return null;
  return (
    <Tr className="items-center" key={`group-identity-${id}`}>
      <Td>
        <p>{name ?? "-"}</p>
      </Td>
      <Td>
        <Tooltip content={joinedGroupAt ? new Date(joinedGroupAt).toLocaleString() : "-"}>
          <p>{joinedGroupAt ? new Date(joinedGroupAt).toLocaleDateString() : "-"}</p>
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
                      icon={<FontAwesomeIcon icon={faUserMinus} />}
                      onClick={() =>
                        handlePopUpOpen("removeMemberFromGroup", { identityId: id, name })
                      }
                      isDisabled={!isAllowed}
                    >
                      Remove Identity From Group
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
