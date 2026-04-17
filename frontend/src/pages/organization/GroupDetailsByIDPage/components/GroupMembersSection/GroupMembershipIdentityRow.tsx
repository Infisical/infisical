import { format } from "date-fns";
import { HardDriveIcon, MoreHorizontalIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { GroupMemberType, TGroupMemberMachineIdentity } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identity: TGroupMemberMachineIdentity;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup"]>,
    data?: object
  ) => void;
  isLinkedGroup?: boolean;
};

export const GroupMembershipIdentityRow = ({
  identity: {
    machineIdentity: { name },
    joinedGroupAt,
    id
  },
  handlePopUpOpen,
  isLinkedGroup = false
}: Props) => {
  return (
    <TableRow key={`group-identity-${id}`}>
      <TableCell>
        <HardDriveIcon size={14} className="text-mineshaft-400" />
      </TableCell>
      <TableCell isTruncatable>{name}</TableCell>
      <TableCell>{format(new Date(joinedGroupAt), "yyyy-MM-dd")}</TableCell>
      <TableCell>
        {!isLinkedGroup && (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <IconButton variant="ghost" size="xs">
                <MoreHorizontalIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
                {(isAllowed) => (
                  <DropdownMenuItem
                    variant="danger"
                    onClick={() =>
                      handlePopUpOpen("removeMemberFromGroup", {
                        memberType: GroupMemberType.MACHINE_IDENTITY,
                        identityId: id,
                        name
                      })
                    }
                    isDisabled={!isAllowed}
                  >
                    Remove Identity From Group
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
};
