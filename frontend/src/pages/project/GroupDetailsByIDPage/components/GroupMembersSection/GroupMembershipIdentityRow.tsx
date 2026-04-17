import { EllipsisIcon, HardDriveIcon } from "lucide-react";

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
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/context";
import { TGroupMemberMachineIdentity } from "@app/hooks/api/groups/types";

type Props = {
  identity: TGroupMemberMachineIdentity;
  onAssumePrivileges: (identityId: string) => void;
};

export const GroupMembershipIdentityRow = ({
  identity: {
    machineIdentity: { name },
    joinedGroupAt,
    id
  },
  onAssumePrivileges
}: Props) => {
  return (
    <TableRow>
      <TableCell>
        <HardDriveIcon size={14} className="text-mineshaft-400" />
      </TableCell>
      <TableCell isTruncatable>{name}</TableCell>
      <TableCell>{new Date(joinedGroupAt).toLocaleDateString()}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs">
              <EllipsisIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <ProjectPermissionCan
              I={ProjectPermissionIdentityActions.AssumePrivileges}
              a={ProjectPermissionSub.Identity}
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
