import { MoreHorizontalIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { TGroupWithProjectMemberships } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  group: TGroupWithProjectMemberships;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromGroup"]>, data?: object) => void;
};

export const UserGroupsRow = ({ group, handlePopUpOpen }: Props) => {
  return (
    <TableRow key={`user-group-membership-${group.id}`}>
      <TableCell>{group.name}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <IconButton variant="ghost" size="xs">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
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
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
