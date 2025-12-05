import { useCallback } from "react";
import {
  faCheck,
  faCopy,
  faEdit,
  faEllipsisV,
  faRightToBracket,
  faRotate,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { FolderIcon, PackageOpenIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
import { Badge } from "@app/components/v3";
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
  isFlatView: boolean;
  accountPath?: string;
  isAccessLoading?: boolean;
};

export const PamAccountRow = ({
  account,
  search,
  onAccess,
  onUpdate,
  onDelete,
  isFlatView,
  accountPath,
  isAccessLoading
}: Props) => {
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
            <Badge variant="neutral">
              <PackageOpenIcon />
              <span>
                <HighlightText text={account.resource.name} highlight={search} />
              </span>
            </Badge>
            {isFlatView && accountPath && (
              <Badge variant="neutral">
                <FolderIcon />
                <span>
                  <HighlightText text={accountPath} highlight={search} />
                </span>
              </Badge>
            )}
            {"lastRotatedAt" in account && account.lastRotatedAt && (
              <Tooltip
                className="max-w-sm text-center"
                isDisabled={!account.lastRotationMessage}
                content={account.lastRotationMessage}
              >
                <Badge variant={account.rotationStatus === "failed" ? "danger" : "success"}>
                  <FontAwesomeIcon icon={faRotate} />
                  <span>Rotated {formatDistance(new Date(), account.lastRotatedAt)} ago</span>
                </Badge>
              </Tooltip>
            )}
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
              isLoading={isAccessLoading}
              isDisabled={isAccessLoading}
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
