import { format } from "date-fns";
import { MoreHorizontalIcon, UserIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableTableCell,
  UnstableTableRow
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
};

export const GroupMembershipUserRow = ({
  user: {
    user: { firstName, lastName, email, username },
    joinedGroupAt,
    id
  },
  handlePopUpOpen
}: Props) => {
  const { currentOrg } = useOrganization();

  const { data: isOidcManageGroupMembershipsEnabled = false } =
    useOidcManageGroupMembershipsEnabled(currentOrg.id);

  return (
    <UnstableTableRow key={`group-user-${id}`}>
      <UnstableTableCell>
        <UserIcon size={14} className="text-mineshaft-400" />
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>
        {`${firstName ?? "-"} ${lastName ?? ""}`} <span className="text-muted">({email})</span>
      </UnstableTableCell>
      <UnstableTableCell>{format(new Date(joinedGroupAt), "yyyy-MM-dd")}</UnstableTableCell>
      <UnstableTableCell>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger>
            <UnstableIconButton variant="ghost" size="xs">
              <MoreHorizontalIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
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
                  <UnstableDropdownMenuItem
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
                  </UnstableDropdownMenuItem>
                </Tooltip>
              )}
            </OrgPermissionCan>
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
