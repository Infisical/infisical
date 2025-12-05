import { faEllipsisV, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { UserIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/context";
import { TGroupMemberUser } from "@app/hooks/api/groups/types";

type Props = {
  user: TGroupMemberUser;
  onAssumePrivileges: (userId: string) => void;
};

export const GroupMembershipUserRow = ({
  user: { firstName, lastName, joinedGroupAt, email, id },
  onAssumePrivileges
}: Props) => {
  return (
    <Tr className="items-center" key={`group-user-${id}`}>
      <Td className="pr-0">
        <UserIcon size={20} />
      </Td>
      <Td className="pl-2">
        <p>
          {`${firstName ?? "-"} ${lastName ?? ""}`}{" "}
          <span className="text-mineshaft-400">({email})</span>
        </p>
      </Td>
      <Td>
        <Tooltip content={new Date(joinedGroupAt).toLocaleString()}>
          <p className="inline-block">{new Date(joinedGroupAt).toLocaleDateString()}</p>
        </Tooltip>
      </Td>
      <Td>
        <Tooltip className="max-w-sm text-center" content="Options">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Options"
                colorSchema="secondary"
                className="w-6"
                variant="plain"
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <ProjectPermissionCan
                I={ProjectPermissionMemberActions.AssumePrivileges}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => {
                  return (
                    <DropdownMenuItem
                      icon={<FontAwesomeIcon icon={faUser} />}
                      onClick={() => onAssumePrivileges(id)}
                      isDisabled={!isAllowed}
                    >
                      Assume Privileges
                    </DropdownMenuItem>
                  );
                }}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
