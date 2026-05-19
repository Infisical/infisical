import { faAsterisk, faEllipsisV, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AlertTriangleIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

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
import { Tooltip as TooltipV3, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionActions } from "@app/context/OrgPermissionContext/types";
import { AUDIT_LOG_STREAM_PROVIDER_MAP, getProviderUrl } from "@app/helpers/auditLogStreams";
import { TAuditLogStream } from "@app/hooks/api/types";

import { LastErrorSection } from "./LastErrorSection";

type Props = {
  logStream: TAuditLogStream;
  onDelete: (logStream: TAuditLogStream) => void;
  onEditCredentials: (logStream: TAuditLogStream) => void;
};

export const AuditLogStreamRow = ({ logStream, onDelete, onEditCredentials }: Props) => {
  const { id, provider, lastErrorMessage, lastErrorTimestamp } = logStream;

  const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];
  const url = getProviderUrl(logStream);

  const hasLastError = Boolean(lastErrorMessage || lastErrorTimestamp);

  return (
    <Tr
      className={twMerge("group h-12 transition-colors duration-100 hover:bg-mineshaft-700")}
      key={`log-stream-${id}`}
    >
      <Td>
        <div className="flex items-center gap-2">
          <div className="relative">
            {providerDetails.image ? (
              <img
                alt={providerDetails.name}
                src={`/images/integrations/${providerDetails.image}`}
                className="size-5"
              />
            ) : (
              providerDetails.icon && (
                <FontAwesomeIcon
                  icon={providerDetails.icon}
                  className="size-5 text-mineshaft-300"
                />
              )
            )}
          </div>
          <span className="hidden lg:inline">{providerDetails.name}</span>
        </div>
      </Td>
      <Td className="max-w-0 min-w-32!">
        <div className="flex w-full items-center gap-2">
          <p className="truncate">{url}</p>
          {hasLastError && (
            <TooltipV3>
              <TooltipTrigger>
                <AlertTriangleIcon
                  className="size-4 shrink-0 text-yellow-500"
                  aria-label="Stream is failing"
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-96 min-w-52 px-3">
                <LastErrorSection
                  lastErrorMessage={lastErrorMessage ?? null}
                  lastErrorTimestamp={lastErrorTimestamp ?? null}
                />
              </TooltipContent>
            </TooltipV3>
          )}
        </div>
      </Td>
      <Td>
        <div className="flex items-center justify-end gap-2">
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
                <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      icon={<FontAwesomeIcon icon={faAsterisk} />}
                      onClick={() => onEditCredentials(logStream)}
                    >
                      Edit Credentials
                    </DropdownMenuItem>
                  )}
                </OrgPermissionCan>
                <OrgPermissionCan
                  I={OrgPermissionActions.Delete}
                  a={OrgPermissionSubjects.Settings}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      icon={<FontAwesomeIcon icon={faTrash} />}
                      onClick={() => onDelete(logStream)}
                    >
                      Delete Stream
                    </DropdownMenuItem>
                  )}
                </OrgPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
};
