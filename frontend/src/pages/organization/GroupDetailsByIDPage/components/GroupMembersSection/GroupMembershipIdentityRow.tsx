import { format } from "date-fns";
import { HardDriveIcon, MoreHorizontalIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableTableCell,
  UnstableTableRow
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
  isInherited?: boolean;
};

export const GroupMembershipIdentityRow = ({
  identity: {
    machineIdentity: { name },
    joinedGroupAt,
    id
  },
  handlePopUpOpen,
  isInherited = false
}: Props) => {
  return (
    <UnstableTableRow key={`group-identity-${id}`}>
      <UnstableTableCell>
        <HardDriveIcon size={14} className="text-mineshaft-400" />
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>{name}</UnstableTableCell>
      <UnstableTableCell>{format(new Date(joinedGroupAt), "yyyy-MM-dd")}</UnstableTableCell>
      <UnstableTableCell>
        {!isInherited && (
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger>
              <UnstableIconButton variant="ghost" size="xs">
                <MoreHorizontalIcon />
              </UnstableIconButton>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="end">
              <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
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
                  </UnstableDropdownMenuItem>
                )}
              </OrgPermissionCan>
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
        )}
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
