import { useCallback } from "react";
import { subject } from "@casl/ability";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import {
  AsteriskIcon,
  CheckIcon,
  CopyIcon,
  Ellipsis,
  InfoIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  ServerIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  OrgIcon,
  ProjectIcon,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionSubjects, ProjectPermissionSub, useOrganization } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import {
  APP_CONNECTION_MAP,
  buildGitHubAppUrl,
  getAppConnectionMethodDetails
} from "@app/helpers/appConnections";
import { getProjectBaseURL } from "@app/helpers/project";
import { useToggle } from "@app/hooks";
import { GitHubConnectionMethod, TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListGitHubApps } from "@app/hooks/api/gitHubApps";

import { CredentialRotationStatusBadge } from "./AppConnectionForm/shared/CredentialRotationBadge";

type Props = {
  appConnection: TAppConnection;
  onDelete: (appConnection: TAppConnection) => void;
  onEditCredentials: (appConnection: TAppConnection) => void;
  onEditDetails: (appConnection: TAppConnection) => void;
  onRotateCredentials: (appConnection: TAppConnection) => void;
  onToggleAutoRotation: (appConnection: TAppConnection) => void;
  isProjectView: boolean;
};

export const AppConnectionRow = ({
  appConnection,
  onDelete,
  onEditCredentials,
  onEditDetails,
  onRotateCredentials,
  onToggleAutoRotation,
  isProjectView
}: Props) => {
  const { currentOrg } = useOrganization();
  const {
    id,
    name,
    method,
    app,
    description,
    isPlatformManagedCredentials,
    project,
    isAutoRotationEnabled
  } = appConnection;

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

  const connectionDetails = APP_CONNECTION_MAP[app];

  const isGitHubAppConnection =
    app === AppConnection.GitHub && method === GitHubConnectionMethod.App;

  const gitHubAppCredentials = isGitHubAppConnection
    ? (appConnection.credentials as {
        gitHubAppId?: string | null;
        host?: string;
        instanceType?: "cloud" | "server";
      })
    : null;

  const { data: gitHubApps } = useListGitHubApps(
    isGitHubAppConnection ? currentOrg?.id : undefined,
    appConnection.projectId
  );

  const linkedGitHubApp = isGitHubAppConnection
    ? gitHubApps?.find((a) => a.id === (gitHubAppCredentials?.gitHubAppId ?? null))
    : null;

  const gitHubAppUrl = linkedGitHubApp
    ? buildGitHubAppUrl(
        linkedGitHubApp.slug,
        gitHubAppCredentials?.host,
        gitHubAppCredentials?.instanceType
      )
    : null;

  return (
    <TableRow className="group" key={`app-connection-${id}`}>
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
          <span className="hidden lg:inline">{connectionDetails.name}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-0 min-w-32!">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="ml-1 size-3.5 text-mineshaft-400" />
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-0 min-w-32!">
        {gitHubAppUrl && linkedGitHubApp ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={gitHubAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-mineshaft-100 underline-offset-2 hover:text-primary hover:underline"
              >
                <FontAwesomeIcon
                  size="sm"
                  className="text-mineshaft-300/75"
                  icon={methodDetails.icon}
                />
                <span className="truncate underline">{methodDetails.name}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] tracking-wider text-mineshaft-400 uppercase">
                  {methodDetails.name}
                </span>
                <span className="font-mono text-sm text-mineshaft-100">{linkedGitHubApp.slug}</span>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <p className="truncate">
            <FontAwesomeIcon
              size="sm"
              className="mr-1.5 text-mineshaft-300/75"
              icon={methodDetails.icon}
            />
            {methodDetails.name}
          </p>
        )}
      </TableCell>
      {!isProjectView && (
        <TableCell className="max-w-0 min-w-32!">
          {project ? (
            <Link
              // @ts-expect-error app-connections aren't in kms/ssh
              to={`${getProjectBaseURL(project.type)}/app-connections`}
              params={{
                orgId: currentOrg?.id || "",
                projectId: project.id
              }}
              className="underline"
            >
              <p className="flex items-center gap-1.5 truncate">
                <ProjectIcon className="size-3.5 text-mineshaft-300/75" />
                {project.name}
              </p>
            </Link>
          ) : (
            <p className="flex items-center gap-1.5 truncate">
              <OrgIcon className="size-3.5 text-mineshaft-300/75" />
              Organization
            </p>
          )}
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          {isPlatformManagedCredentials && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Badge variant="info">
                    <ServerIcon />
                    Platform Managed Credentials
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
              <IconButton aria-label="Options" variant="ghost" size="xs">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem onClick={() => handleCopyId()}>
                {isIdCopied ? <CheckIcon /> : <CopyIcon />}
                Copy Connection ID
              </DropdownMenuItem>
              {(isProjectView || !project) && (
                <>
                  <VariablePermissionCan
                    type={isProjectView ? "project" : "org"}
                    I={
                      isProjectView
                        ? ProjectPermissionAppConnectionActions.Edit
                        : OrgPermissionAppConnectionActions.Edit
                    }
                    a={
                      isProjectView
                        ? subject(ProjectPermissionSub.AppConnections, {
                            connectionId: id
                          })
                        : subject(OrgPermissionSubjects.AppConnections, {
                            connectionId: id
                          })
                    }
                  >
                    {(isAllowed: boolean) => (
                      <DropdownMenuItem
                        isDisabled={!isAllowed}
                        onClick={() => onEditDetails(appConnection)}
                      >
                        <PencilIcon />
                        Edit Details
                      </DropdownMenuItem>
                    )}
                  </VariablePermissionCan>
                  <VariablePermissionCan
                    type={isProjectView ? "project" : "org"}
                    I={
                      isProjectView
                        ? ProjectPermissionAppConnectionActions.Edit
                        : OrgPermissionAppConnectionActions.Edit
                    }
                    a={
                      isProjectView
                        ? subject(ProjectPermissionSub.AppConnections, {
                            connectionId: id
                          })
                        : subject(OrgPermissionSubjects.AppConnections, {
                            connectionId: id
                          })
                    }
                  >
                    {(isAllowed: boolean) => (
                      <DropdownMenuItem
                        isDisabled={!isAllowed}
                        onClick={() => onEditCredentials(appConnection)}
                      >
                        <AsteriskIcon />
                        {isPlatformManagedCredentials ? "View" : "Edit"} Credentials
                      </DropdownMenuItem>
                    )}
                  </VariablePermissionCan>
                  {appConnection.rotation && (
                    <VariablePermissionCan
                      type={isProjectView ? "project" : "org"}
                      I={
                        isProjectView
                          ? ProjectPermissionAppConnectionActions.Edit
                          : OrgPermissionAppConnectionActions.Edit
                      }
                      a={
                        isProjectView
                          ? subject(ProjectPermissionSub.AppConnections, {
                              connectionId: id
                            })
                          : subject(OrgPermissionSubjects.AppConnections, {
                              connectionId: id
                            })
                      }
                    >
                      {(isAllowed: boolean) => (
                        <>
                          <DropdownMenuItem
                            isDisabled={!isAllowed}
                            onClick={() => onRotateCredentials(appConnection)}
                          >
                            <RefreshCwIcon />
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
                    </VariablePermissionCan>
                  )}
                  <VariablePermissionCan
                    type={isProjectView ? "project" : "org"}
                    I={
                      isProjectView
                        ? ProjectPermissionAppConnectionActions.Delete
                        : OrgPermissionAppConnectionActions.Delete
                    }
                    a={
                      isProjectView
                        ? subject(ProjectPermissionSub.AppConnections, {
                            connectionId: id
                          })
                        : subject(OrgPermissionSubjects.AppConnections, {
                            connectionId: id
                          })
                    }
                  >
                    {(isAllowed: boolean) => (
                      <DropdownMenuItem
                        variant="danger"
                        isDisabled={!isAllowed}
                        onClick={() => onDelete(appConnection)}
                      >
                        <Trash2Icon />
                        Delete Connection
                      </DropdownMenuItem>
                    )}
                  </VariablePermissionCan>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
