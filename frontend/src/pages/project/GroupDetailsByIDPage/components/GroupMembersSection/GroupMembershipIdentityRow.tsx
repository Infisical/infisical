import { EllipsisIcon, HardDriveIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableTableCell,
  UnstableTableRow
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
    <UnstableTableRow>
      <UnstableTableCell>
        <HardDriveIcon size={14} className="text-mineshaft-400" />
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>{name}</UnstableTableCell>
      <UnstableTableCell>{new Date(joinedGroupAt).toLocaleDateString()}</UnstableTableCell>
      <UnstableTableCell>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant="ghost" size="xs">
              <EllipsisIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <ProjectPermissionCan
              I={ProjectPermissionIdentityActions.AssumePrivileges}
              a={ProjectPermissionSub.Identity}
            >
              {(isAllowed) => {
                return (
                  <UnstableDropdownMenuItem
                    onClick={() => onAssumePrivileges(id)}
                    isDisabled={!isAllowed}
                  >
                    Assume Privileges
                  </UnstableDropdownMenuItem>
                );
              }}
            </ProjectPermissionCan>
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
