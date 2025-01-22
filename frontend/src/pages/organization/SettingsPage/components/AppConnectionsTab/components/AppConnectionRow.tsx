import { useCallback } from "react";
import {
  faAsterisk,
  faCheck,
  faCopy,
  faEdit,
  faEllipsisV,
  faInfoCircle,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
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
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useToggle } from "@app/hooks";
import { TAppConnection } from "@app/hooks/api/appConnections";

type Props = {
  appConnection: TAppConnection;
  onDelete: (appConnection: TAppConnection) => void;
  onEditCredentials: (appConnection: TAppConnection) => void;
  onEditDetails: (appConnection: TAppConnection) => void;
};

export const AppConnectionRow = ({
  appConnection,
  onDelete,
  onEditCredentials,
  onEditDetails
}: Props) => {
  const { id, name, method, app, description } = appConnection;

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);

    createNotification({
      text: "Connection ID copied to clipboard",
      type: "info"
    });

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isIdCopied]);

  const methodDetails = getAppConnectionMethodDetails(method);

  return (
    <Tr
      className={twMerge("group h-12 transition-colors duration-100 hover:bg-mineshaft-700")}
      key={`app-connection-${id}`}
    >
      <Td>
        <div className="flex items-center gap-2">
          <img
            alt={`${APP_CONNECTION_MAP[app].name} integration`}
            src={`/images/integrations/${APP_CONNECTION_MAP[app].image}`}
            className="mr-0.5 h-5 w-5"
          />
          <span className="hidden lg:inline">{APP_CONNECTION_MAP[app].name}</span>
        </div>
      </Td>
      <Td className="!min-w-[8rem] max-w-0">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
          {description && (
            <Tooltip content={description}>
              <FontAwesomeIcon icon={faInfoCircle} className="ml-1 text-mineshaft-400" />
            </Tooltip>
          )}
        </div>
      </Td>
      <Td className="!min-w-[8rem] max-w-0">
        <p className="truncate">
          <FontAwesomeIcon
            size="sm"
            className="mr-1.5 text-mineshaft-300/75"
            icon={methodDetails.icon}
          />
          {methodDetails.name}
        </p>
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
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                onClick={() => handleCopyId()}
              >
                Copy Connection ID
              </DropdownMenuItem>
              <OrgPermissionCan
                I={OrgPermissionAppConnectionActions.Edit}
                a={OrgPermissionSubjects.AppConnections}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faEdit} />}
                    onClick={() => onEditDetails(appConnection)}
                  >
                    Edit Details
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
              <OrgPermissionCan
                I={OrgPermissionAppConnectionActions.Edit}
                a={OrgPermissionSubjects.AppConnections}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faAsterisk} />}
                    onClick={() => onEditCredentials(appConnection)}
                  >
                    Edit Credentials
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
              <OrgPermissionCan
                I={OrgPermissionAppConnectionActions.Delete}
                a={OrgPermissionSubjects.AppConnections}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                    onClick={() => onDelete(appConnection)}
                  >
                    Delete Connection
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
