import { format } from "date-fns";
import { MoreHorizontalIcon, UserIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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

  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();

  return (
    <TableRow key={`group-user-${id}`}>
      <TableCell>
        <UserIcon size={14} className="text-muted" />
      </TableCell>
      <TableCell isTruncatable>
        {fullName ? (
          <>
            {fullName} <span className="text-muted">({email})</span>
          </>
        ) : (
          email
        )}
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
                    hoverable
                    delayDuration={50}
                    open={isOidcManageGroupMembershipsEnabled ? undefined : false}
                  >
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        variant="danger"
                        onClick={() =>
                          handlePopUpOpen("removeMemberFromGroup", {
                            memberType: GroupMemberType.USER,
                            username
                          })
                        }
                        isDisabled={!isAllowed || isOidcManageGroupMembershipsEnabled}
                        isDisabledFocusable={isOidcManageGroupMembershipsEnabled}
                      >
                        Remove User From Group
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      OIDC Group Membership Mapping Enabled. Remove user from this group in your
                      OIDC provider.
                    </TooltipContent>
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
