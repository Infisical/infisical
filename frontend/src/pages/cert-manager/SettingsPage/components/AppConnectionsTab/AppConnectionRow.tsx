import { useCallback } from "react";
import { subject } from "@casl/ability";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  AsteriskIcon,
  CheckIcon,
  CopyIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RotateCwIcon,
  ServerIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useToggle } from "@app/hooks";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { CredentialRotationStatusBadge } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm/shared/CredentialRotationBadge";

type Props = {
  appConnection: TAppConnection;
  onDelete: (appConnection: TAppConnection) => void;
  onEditCredentials: (appConnection: TAppConnection) => void;
  onEditDetails: (appConnection: TAppConnection) => void;
  onRotateCredentials: (appConnection: TAppConnection) => void;
  onToggleAutoRotation: (appConnection: TAppConnection) => void;
};

export const AppConnectionRow = ({
  appConnection,
  onDelete,
  onEditCredentials,
  onEditDetails,
  onRotateCredentials,
  onToggleAutoRotation
}: Props) => {
  const {
    id,
    name,
    method,
    app,
    description,
    isPlatformManagedCredentials,
    isAutoRotationEnabled
  } = appConnection;

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);
    createNotification({ text: "Connection ID copied to clipboard", type: "info" });
    setTimeout(() => setIsIdCopied.off(), 2000);
  }, [id, setIsIdCopied]);

  const methodDetails = getAppConnectionMethodDetails(method);
  const connectionDetails = APP_CONNECTION_MAP[app];

  return (
    <TableRow key={`app-connection-${id}`}>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="relative">
            <img
              alt={`${connectionDetails.name} integration`}
              src={`/images/integrations/${connectionDetails.image}`}
              className="mr-0.5 w-5"
            />
            {connectionDetails.icon && (
              <FontAwesomeIcon
                icon={connectionDetails.icon}
                size="xs"
                className="absolute -right-0.5 -bottom-0.5 text-primary-700"
              />
            )}
          </div>
          <span>{connectionDetails.name}</span>
        </div>
      </TableCell>
      <TableCell isTruncatable>
        <div className="flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="text-accent" />
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell isTruncatable>
        <div className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={methodDetails.icon} className="text-accent" />
          <span className="truncate">{methodDetails.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {isPlatformManagedCredentials && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Badge variant="info">
                    <ServerIcon />
                    Platform Managed
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                This connection&apos;s credentials are managed by Infisical.
              </TooltipContent>
            </Tooltip>
          )}
          {appConnection.rotation && (
            <CredentialRotationStatusBadge appConnection={appConnection} />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs">
                <MoreHorizontalIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleCopyId()}>
                {isIdCopied ? <CheckIcon /> : <CopyIcon />}
                Copy Connection ID
              </DropdownMenuItem>
              <ProjectPermissionCan
                I={ProjectPermissionAppConnectionActions.Edit}
                a={subject(ProjectPermissionSub.AppConnections, { connectionId: id })}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={() => onEditDetails(appConnection)}
                  >
                    <PencilIcon />
                    Edit Details
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionAppConnectionActions.Edit}
                a={subject(ProjectPermissionSub.AppConnections, { connectionId: id })}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={() => onEditCredentials(appConnection)}
                  >
                    <AsteriskIcon />
                    {isPlatformManagedCredentials ? "View" : "Edit"} Credentials
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              {appConnection.rotation && (
                <ProjectPermissionCan
                  I={ProjectPermissionAppConnectionActions.Edit}
                  a={subject(ProjectPermissionSub.AppConnections, { connectionId: id })}
                >
                  {(isAllowed) => (
                    <>
                      <DropdownMenuItem
                        isDisabled={!isAllowed}
                        onClick={() => onRotateCredentials(appConnection)}
                      >
                        <RotateCwIcon />
                        Rotate Credentials
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        isDisabled={!isAllowed}
                        onClick={() => onToggleAutoRotation(appConnection)}
                      >
                        {isAutoRotationEnabled ? <PauseIcon /> : <PlayIcon />}
                        {isAutoRotationEnabled ? "Disable" : "Enable"} Auto-Rotation
                      </DropdownMenuItem>
                    </>
                  )}
                </ProjectPermissionCan>
              )}
              <ProjectPermissionCan
                I={ProjectPermissionAppConnectionActions.Delete}
                a={subject(ProjectPermissionSub.AppConnections, { connectionId: id })}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    variant="danger"
                    onClick={() => onDelete(appConnection)}
                  >
                    <Trash2Icon />
                    Delete Connection
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
