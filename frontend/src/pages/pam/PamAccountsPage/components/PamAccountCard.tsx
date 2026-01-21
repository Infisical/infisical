import { useCallback } from "react";
import { faCheck, faCopy, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { EllipsisIcon, LogInIcon, PackageOpenIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { Badge, Button, UnstableIconButton } from "@app/components/v3";
import {
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { PAM_RESOURCE_TYPE_MAP, TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  onAccess: (resource: TPamAccount) => void;
  onUpdate: (resource: TPamAccount) => void;
  onDelete: (resource: TPamAccount) => void;
  accountPath?: string;
};

export const PamAccountCard = ({ account, onAccess, accountPath, onUpdate, onDelete }: Props) => {
  const { id, name, description, resource } = account;

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

      setTimeout(() => setIsIdCopied.off(), 2000);
    },
    [setIsIdCopied]
  );

  return (
    <div
      key={account.id}
      className="flex flex-col overflow-clip rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-4 text-start transition-transform duration-100"
    >
      <div className="flex items-center gap-3.5">
        <img
          alt={resourceTypeName}
          src={`/images/integrations/${image}`}
          className="size-10 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-lg font-medium text-mineshaft-100">{name}</p>
            <div className="flex items-center gap-2">
              <Button onClick={() => onAccess(account)} size="xs" variant="outline">
                <LogInIcon />
                Connect
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <UnstableIconButton size="xs" variant="ghost">
                    <EllipsisIcon />
                  </UnstableIconButton>
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
            </div>
          </div>

          <p
            className={`${accountPath ? "text-mineshaft-300" : "text-mineshaft-400"} truncate text-xs leading-4`}
          >
            {resourceTypeName} - {accountPath || "root"}
          </p>
        </div>
      </div>
      <Badge variant="neutral" className="mt-3.5">
        <PackageOpenIcon />
        {resource.name}
      </Badge>
      <p className="mt-2 truncate text-sm text-mineshaft-400">{description || "No description"}</p>
    </div>
  );
};
