import { useCallback } from "react";
import {
  faBoxOpen,
  faCheck,
  faCopy,
  faEdit,
  faEllipsisV,
  faRightToBracket,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { PAM_RESOURCE_TYPE_MAP, TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  onAccess: (resource: TPamAccount) => void;
  onUpdate: (resource: TPamAccount) => void;
  onDelete: (resource: TPamAccount) => void;
  search: string;
};

export const PamAccountRow = ({ account, search, onAccess, onUpdate, onDelete }: Props) => {
  const { id, name } = account;

  const { image, name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(
    (idToCopy: string) => {
      setIsIdCopied.on();
      navigator.clipboard.writeText(idToCopy);

      createNotification({
        text: "Account ID copied to clipboard",
        type: "info"
      });

      const timer = setTimeout(() => setIsIdCopied.off(), 2000);

      // eslint-disable-next-line consistent-return
      return () => clearTimeout(timer);
    },
    [isIdCopied]
  );

  return (
    <Tr className={twMerge("group h-10")} key={`account-${id}`}>
      <Td>
        <div className="flex items-center gap-4">
          <div className="relative">
            <img alt={resourceTypeName} src={`/images/integrations/${image}`} className="size-5" />
          </div>
          <div className="flex items-center gap-3">
            <span>
              <HighlightText text={name} highlight={search} />
            </span>
            <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-bunker-300/20 text-bunker-300">
              <FontAwesomeIcon icon={faBoxOpen} />
              <span>
                <HighlightText text={account.resource.name} highlight={search} />
              </span>
            </Badge>
          </div>
        </div>
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <ProjectPermissionCan
            I={ProjectPermissionPamAccountActions.Access}
            a={ProjectPermissionSub.PamAccounts}
          >
            <Button
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faRightToBracket} />}
              onClick={() => onAccess(account)}
              size="xs"
            >
              Access
            </Button>
          </ProjectPermissionCan>
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
                <DropdownMenuItem
                  icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyId(id);
                  }}
                >
                  Copy Account ID
                </DropdownMenuItem>
                <ProjectPermissionCan
                  I={ProjectPermissionPamAccountActions.Edit}
                  a={ProjectPermissionSub.PamAccounts}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      icon={<FontAwesomeIcon icon={faEdit} />}
                      onClick={() => onUpdate(account)}
                    >
                      Edit Account
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionPamAccountActions.Delete}
                  a={ProjectPermissionSub.PamAccounts}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      icon={<FontAwesomeIcon icon={faTrash} />}
                      onClick={() => onDelete(account)}
                    >
                      Delete Account
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
};
