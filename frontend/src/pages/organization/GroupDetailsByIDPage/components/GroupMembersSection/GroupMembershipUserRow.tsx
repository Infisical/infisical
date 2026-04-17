import { format } from "date-fns";
import { MoreHorizontalIcon, UserIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useOidcManageGroupMembershipsEnabled } from "@app/hooks/api";
import { GroupMemberType, TGroupMemberUser } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  user: TGroupMemberUser;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup"]>,
    data?: object
  ) => void;
  isLinkedGroup?: boolean;
};

export const GroupMembershipUserRow = ({
  user: {
    user: { firstName, lastName, email, username },
    joinedGroupAt,
    id
  },
  handlePopUpOpen,
  isLinkedGroup = false
}: Props) => {
  const { currentOrg } = useOrganization();

  const { data: isOidcManageGroupMembershipsEnabled = false } =
    useOidcManageGroupMembershipsEnabled(currentOrg.id);

  return (
    <TableRow key={`group-user-${id}`}>
      <TableCell>
        <UserIcon size={14} className="text-mineshaft-400" />
      </TableCell>
      <TableCell isTruncatable>
        {`${firstName ?? "-"} ${lastName ?? ""}`} <span className="text-muted">({email})</span>
      </TableCell>
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
                  <Tooltip
                    content={
                      isOidcManageGroupMembershipsEnabled
                        ? "OIDC Group Membership Mapping Enabled. Remove user from this group in your OIDC provider."
                        : undefined
                    }
                    position="left"
                  >
                    <DropdownMenuItem
                      variant="danger"
                      onClick={() =>
                        handlePopUpOpen("removeMemberFromGroup", {
                          memberType: GroupMemberType.USER,
                          username
                        })
                      }
                      isDisabled={!isAllowed || isOidcManageGroupMembershipsEnabled}
                    >
                      Remove User From Group
                    </DropdownMenuItem>
                  </Tooltip>
                )}
              </OrgPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
};
