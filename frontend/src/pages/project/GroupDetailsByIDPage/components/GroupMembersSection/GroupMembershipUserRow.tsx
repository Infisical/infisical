import { EllipsisIcon, UserIcon } from "lucide-react";

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
    <UnstableTableRow>
      <UnstableTableCell>
        <UserIcon size={14} className="text-mineshaft-400" />
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>
        {`${firstName ?? "-"} ${lastName ?? ""}`}{" "}
        <span className="text-mineshaft-400">({email})</span>
      </UnstableTableCell>
      <UnstableTableCell>{new Date(joinedGroupAt).toLocaleDateString()}</UnstableTableCell>
      <UnstableTableCell>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton size="xs" variant="ghost">
              <EllipsisIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <ProjectPermissionCan
              I={ProjectPermissionMemberActions.AssumePrivileges}
              a={ProjectPermissionSub.Member}
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
