import { faEllipsisV, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { HardDriveIcon } from "lucide-react";

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
    <Tr className="items-center" key={`group-identity-${id}`}>
      <Td className="pr-0">
        <HardDriveIcon size={20} />
      </Td>
      <Td className="pl-2">
        <p>{name}</p>
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
                I={ProjectPermissionIdentityActions.AssumePrivileges}
                a={ProjectPermissionSub.Identity}
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
