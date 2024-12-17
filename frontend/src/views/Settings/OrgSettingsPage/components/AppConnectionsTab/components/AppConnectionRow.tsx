import { useCallback } from "react";
import {
  faAsterisk,
  faCheck,
  faCopy,
  faEdit,
  faEllipsisV,
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
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { APP_CONNECTION_MAP, APP_CONNECTION_METHOD_MAP } from "@app/helpers/appConnections";
import { useToggle } from "@app/hooks";
import { TAppConnection } from "@app/hooks/api/appConnections";

type Props = {
  appConnection: TAppConnection;
  onDelete: (appConnection: TAppConnection) => void;
  onEditCredentials: (appConnection: TAppConnection) => void;
  onEditName: (appConnection: TAppConnection) => void;
};

export const AppConnectionRow = ({
  appConnection,
  onDelete,
  onEditCredentials,
  onEditName
}: Props) => {
  const { id, name, method, app } = appConnection;

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
        <p className="truncate">{name}</p>
      </Td>
      <Td className="!min-w-[8rem] max-w-0">
        <p className="truncate">
          <FontAwesomeIcon
            size="sm"
            className="mr-1.5 text-mineshaft-300/75"
            icon={APP_CONNECTION_METHOD_MAP[method].icon}
          />
          {APP_CONNECTION_METHOD_MAP[method].name}
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
                I={OrgPermissionActions.Edit}
                a={OrgPermissionSubjects.AppConnections}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faEdit} />}
                    onClick={() => onEditName(appConnection)}
                  >
                    Edit Name
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
              <OrgPermissionCan
                I={OrgPermissionActions.Edit}
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
                I={OrgPermissionActions.Delete}
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
