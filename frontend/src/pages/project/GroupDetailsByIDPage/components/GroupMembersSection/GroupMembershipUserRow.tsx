import { EllipsisIcon, UserIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/context";
import { TGroupMemberUser } from "@app/hooks/api/groups/types";

type Props = {
  user: TGroupMemberUser;
  onAssumePrivileges: (userId: string) => void;
};

export const GroupMembershipUserRow = ({
  user: {
    user: { firstName, lastName, email },
    joinedGroupAt,
    id
  },
  onAssumePrivileges
}: Props) => {
  return (
    <TableRow>
      <TableCell>
        <UserIcon size={14} className="text-mineshaft-400" />
      </TableCell>
      <TableCell isTruncatable>
        {`${firstName ?? "-"} ${lastName ?? ""}`}{" "}
        <span className="text-mineshaft-400">({email})</span>
      </TableCell>
      <TableCell>{new Date(joinedGroupAt).toLocaleDateString()}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="xs" variant="ghost">
              <EllipsisIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <ProjectPermissionCan
              I={ProjectPermissionMemberActions.AssumePrivileges}
              a={ProjectPermissionSub.Member}
            >
              {(isAllowed) => {
                return (
                  <DropdownMenuItem onClick={() => onAssumePrivileges(id)} isDisabled={!isAllowed}>
                    Assume Privileges
                  </DropdownMenuItem>
                );
              }}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
