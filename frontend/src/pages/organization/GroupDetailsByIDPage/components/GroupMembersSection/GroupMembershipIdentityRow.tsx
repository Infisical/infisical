import { faEllipsisV, faUserMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ServerIcon } from "lucide-react";

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
import { EGroupMemberType, TGroupMemberIdentity } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identity: TGroupMemberIdentity;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup"]>,
    data?: object
  ) => void;
};

export const GroupMembershipIdentityRow = ({
  identity: { name, joinedGroupAt, id },
  handlePopUpOpen
}: Props) => {
  return (
    <Tr className="items-center" key={`group-user-${id}`}>
      <Td>
        <ServerIcon className="h-4 w-4" />
      </Td>
      <Td>
        <p>{name}</p>
      </Td>
      <Td>
        <Tooltip content={new Date(joinedGroupAt).toLocaleString()}>
          <p>{new Date(joinedGroupAt).toLocaleDateString()}</p>
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
                    <div>
                      <DropdownMenuItem
                        icon={<FontAwesomeIcon icon={faUserMinus} />}
                        onClick={() =>
                          handlePopUpOpen("removeMemberFromGroup", {
                            memberType: EGroupMemberType.IDENTITY,
                            identityId: id,
                            name
                          })
                        }
                        isDisabled={!isAllowed}
                      >
                        Remove Identity From Group
                      </DropdownMenuItem>
                    </div>
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
