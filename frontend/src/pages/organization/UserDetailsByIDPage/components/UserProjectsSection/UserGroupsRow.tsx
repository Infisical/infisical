import { MoreHorizontalIcon } from "lucide-react";

import {
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableTableCell,
  UnstableTableRow
} from "@app/components/v3";
import { TGroupWithProjectMemberships } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  group: TGroupWithProjectMemberships;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromGroup"]>, data?: object) => void;
};

export const UserGroupsRow = ({ group, handlePopUpOpen }: Props) => {
  return (
    <UnstableTableRow key={`user-group-membership-${group.id}`}>
      <UnstableTableCell>{group.name}</UnstableTableCell>
      <UnstableTableCell>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger>
            <UnstableIconButton variant="ghost" size="xs">
              <MoreHorizontalIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <UnstableDropdownMenuItem
              variant="danger"
              onClick={(e) => {
                e.stopPropagation();
                handlePopUpOpen("removeUserFromGroup", {
                  groupId: group.id,
                  groupSlug: group.slug
                });
              }}
            >
              Unassign from Group
            </UnstableDropdownMenuItem>
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
