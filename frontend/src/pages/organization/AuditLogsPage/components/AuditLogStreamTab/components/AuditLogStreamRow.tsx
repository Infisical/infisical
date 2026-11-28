import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { Ellipsis, PencilIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionAuditLogsActions } from "@app/context/OrgPermissionContext/types";
import { AUDIT_LOG_STREAM_PROVIDER_MAP, getProviderUrl } from "@app/helpers/auditLogStreams";
import { AuditLogStreamProduct } from "@app/hooks/api/auditLogStreams/enums";
import { TAuditLogStream } from "@app/hooks/api/types";

import { PRODUCT_ICONS } from "../AuditLogStreamForm/AuditLogStreamProductsField";
import { AuditLogStreamProductBadges } from "./AuditLogStreamProductBadges";

const PamIcon = PRODUCT_ICONS[AuditLogStreamProduct.PAM];

type Props = {
  logStream: TAuditLogStream;
  onDelete: (logStream: TAuditLogStream) => void;
  onEditCredentials: (logStream: TAuditLogStream) => void;
};

export const AuditLogStreamRow = ({ logStream, onDelete, onEditCredentials }: Props) => {
  const { id, provider, failingSince, lastDeliveryError } = logStream;

  const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];
  const url = getProviderUrl(logStream);

  const products = logStream.filters?.products ?? [];
  const pamSessionActivity = logStream.filters?.pamSessionActivity;

  return (
    <TableRow className="group" key={`log-stream-${id}`}>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="relative">
            {providerDetails.image ? (
              <ProviderIcon
                alt={providerDetails.name}
                icon={providerDetails.image}
                className="size-5"
              />
            ) : (
              providerDetails.icon && (
                <FontAwesomeIcon icon={providerDetails.icon} className="size-5 text-muted" />
              )
            )}
          </div>
          <span className="hidden lg:inline">{providerDetails.name}</span>
          {failingSince && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="danger" tabIndex={0}>
                  <TriangleAlertIcon />
                  Failing
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p>Failing since {format(new Date(failingSince), "PPpp")}</p>
                {lastDeliveryError && <p className="mt-1 break-words">{lastDeliveryError}</p>}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-0 min-w-32!">
        <div className="flex w-full items-center gap-2">
          <p className="truncate">{url}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <AuditLogStreamProductBadges products={products} />
          {pamSessionActivity && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="neutral" tabIndex={0}>
                  <PamIcon />
                  PAM Sessions
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                {pamSessionActivity.includeOutput
                  ? "Commands, queries and requests from PAM sessions, including their output."
                  : "Commands, queries and requests from PAM sessions, without their output."}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Options" variant="ghost" size="xs">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <OrgPermissionCan
                I={OrgPermissionAuditLogsActions.Edit}
                a={OrgPermissionSubjects.AuditLogStreams}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={() => onEditCredentials(logStream)}
                  >
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
              <OrgPermissionCan
                I={OrgPermissionAuditLogsActions.Edit}
                a={OrgPermissionSubjects.AuditLogStreams}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => onDelete(logStream)}
                  >
                    <Trash2Icon />
                    Delete Stream
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
