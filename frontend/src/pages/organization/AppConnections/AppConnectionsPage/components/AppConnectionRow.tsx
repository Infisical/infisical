import { useCallback } from "react";
import { subject } from "@casl/ability";
import {
  faAsterisk,
  faBuilding,
  faCheck,
  faCopy,
  faEdit,
  faEllipsisV,
  faInfoCircle,
  faServer,
  faTable,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { OrgPermissionSubjects, ProjectPermissionSub } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { getProjectBaseURL } from "@app/helpers/project";
import { useToggle } from "@app/hooks";
import { TAppConnection } from "@app/hooks/api/appConnections";

type Props = {
  appConnection: TAppConnection;
  onDelete: (appConnection: TAppConnection) => void;
  onEditCredentials: (appConnection: TAppConnection) => void;
  onEditDetails: (appConnection: TAppConnection) => void;
  isProjectView: boolean;
};

export const AppConnectionRow = ({
  appConnection,
  onDelete,
  onEditCredentials,
  onEditDetails,
  isProjectView
}: Props) => {
  const { id, name, method, app, description, isPlatformManagedCredentials, project } =
    appConnection;

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

  return (
    <Tr
      className={twMerge("hover:bg-mineshaft-700 group h-12 transition-colors duration-100")}
      key={`app-connection-${id}`}
    >
      <Td>
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
                className="text-primary-700 absolute -bottom-0.5 -right-0.5"
              />
            )}
          </div>
          <span className="hidden lg:inline">{connectionDetails.name}</span>
        </div>
      </Td>
      <Td className="min-w-32! max-w-0">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
          {description && (
            <Tooltip content={description}>
              <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400 ml-1" />
            </Tooltip>
          )}
        </div>
      </Td>
      <Td className="min-w-32! max-w-0">
        <p className="truncate">
          <FontAwesomeIcon
            size="sm"
            className="text-mineshaft-300/75 mr-1.5"
            icon={methodDetails.icon}
          />
          {methodDetails.name}
        </p>
      </Td>
      {!isProjectView && (
        <Td className="min-w-32! max-w-0">
          {project ? (
            <Link
              // @ts-expect-error app-connections aren't in kms/ssh
              to={`${getProjectBaseURL(project.type)}/app-connections`}
              params={{
                projectId: project.id
              }}
              className="underline"
            >
              <p className="truncate">
                <FontAwesomeIcon
                  size="sm"
                  className="text-mineshaft-300/75 mr-1.5"
                  icon={faTable}
                />
                {project.name}
              </p>
            </Link>
          ) : (
            <p className="truncate">
              <FontAwesomeIcon
                size="sm"
                className="text-mineshaft-300/75 mr-1.5"
                icon={faBuilding}
              />
              Organization
            </p>
          )}
        </Td>
      )}
      <Td>
        <div className="flex items-center justify-end gap-2">
          {isPlatformManagedCredentials && (
            <Tooltip side="left" content="This connection's credentials are managed by Infisical.">
              <div>
                <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap">
                  <FontAwesomeIcon icon={faServer} />
                  <span>Platform Managed Credentials</span>
                </Badge>
              </div>
            </Tooltip>
          )}
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
                  onClick={() => handleCopyId()}
                >
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
                          icon={<FontAwesomeIcon icon={faEdit} />}
                          onClick={() => onEditDetails(appConnection)}
                        >
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
                          icon={<FontAwesomeIcon icon={faAsterisk} />}
                          onClick={() => onEditCredentials(appConnection)}
                        >
                          {isPlatformManagedCredentials ? "View" : "Edit"} Credentials
                        </DropdownMenuItem>
                      )}
                    </VariablePermissionCan>
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
                          isDisabled={!isAllowed}
                          icon={<FontAwesomeIcon icon={faTrash} />}
                          onClick={() => onDelete(appConnection)}
                        >
                          Delete Connection
                        </DropdownMenuItem>
                      )}
                    </VariablePermissionCan>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
};
