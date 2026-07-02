import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Ellipsis, PencilIcon, Trash2Icon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionActions } from "@app/context/OrgPermissionContext/types";
import { AUDIT_LOG_STREAM_PROVIDER_MAP, getProviderUrl } from "@app/helpers/auditLogStreams";
import { TAuditLogStream } from "@app/hooks/api/types";

import { AuditLogStreamProductBadges } from "./AuditLogStreamProductBadges";

type Props = {
  logStream: TAuditLogStream;
  onDelete: (logStream: TAuditLogStream) => void;
  onEditCredentials: (logStream: TAuditLogStream) => void;
};

export const AuditLogStreamRow = ({ logStream, onDelete, onEditCredentials }: Props) => {
  const { id, provider } = logStream;

  const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];
  const url = getProviderUrl(logStream);

  const products = logStream.filters?.products ?? [];

  return (
    <TableRow className="group" key={`log-stream-${id}`}>
      <TableCell>
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
                <FontAwesomeIcon icon={providerDetails.icon} className="size-5 text-muted" />
              )
            )}
          </div>
          <span className="hidden lg:inline">{providerDetails.name}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-0 min-w-32!">
        <div className="flex w-full items-center gap-2">
          <p className="truncate">{url}</p>
        </div>
      </TableCell>
      <TableCell>
        <AuditLogStreamProductBadges products={products} />
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
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
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
              <OrgPermissionCan I={OrgPermissionActions.Delete} a={OrgPermissionSubjects.Settings}>
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
