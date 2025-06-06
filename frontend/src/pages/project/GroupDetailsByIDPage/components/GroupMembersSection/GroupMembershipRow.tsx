import { faEllipsisV, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import { TGroupUser } from "@app/hooks/api/groups/types";

type Props = {
  user: TGroupUser;
  onAssumePrivileges: (userId: string) => void;
};

export const GroupMembershipRow = ({
  user: { firstName, lastName, joinedGroupAt, email, id },
  onAssumePrivileges
}: Props) => {
  return (
    <Tr className="items-center" key={`group-user-${id}`}>
      <Td>
        <p>{`${firstName ?? "-"} ${lastName ?? ""}`}</p>
      </Td>
      <Td>
        <p>{email}</p>
      </Td>
      <Td>
        <Tooltip content={new Date(joinedGroupAt).toLocaleString()}>
          <p>{new Date(joinedGroupAt).toLocaleDateString()}</p>
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
