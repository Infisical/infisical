import { ChevronRight, InfoIcon } from "lucide-react";

import {
  Badge,
  ButtonGroup,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { formatDateTime, Timezone } from "@app/helpers/datetime";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { AuditLog } from "@app/hooks/api/auditLogs/types";

type Props = {
  auditLog: AuditLog;
  rowNumber: number;
  timezone: Timezone;
  onClick: (auditLog: AuditLog) => void;
};

type TagProps = {
  label: string;
  value?: string;
};
const Tag = ({ label, value }: TagProps) => {
  if (!value) return null;

  return (
    <ButtonGroup>
      <Badge variant="neutral" isTruncatable className="max-w-[12rem] shrink-0">
        <span>{label}</span>
      </Badge>
      <Badge variant="neutral" isTruncatable className="border-l-transparent bg-neutral/5">
        <span>{value}</span>
        {value === "unknownUser" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-sm">
              This action doesn&apos;t require authentication, so the requesting actor cannot be
              identified.
            </TooltipContent>
          </Tooltip>
        )}
      </Badge>
    </ButtonGroup>
  );
};

export const LogsTableRow = ({ auditLog, rowNumber, timezone, onClick }: Props) => {
  return (
    <TableRow
      role="button"
      tabIndex={0}
      onClick={() => onClick(auditLog)}
      onKeyDown={(evt) => {
        if (evt.key === "Enter") onClick(auditLog);
      }}
    >
      <TableCell className="text-muted">{rowNumber}</TableCell>
      <TableCell>{formatDateTime({ timestamp: auditLog.createdAt, timezone })}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Tag label="event" value={auditLog.event.type} />
          <Tag label="actor" value={auditLog.actor.type} />
          {auditLog.actor.type === ActorType.USER && (
            <Tag label="user_email" value={auditLog.actor.metadata.email} />
          )}
          {auditLog.actor.type === ActorType.IDENTITY && (
            <Tag label="identity_name" value={auditLog.actor.metadata.name} />
          )}
          {auditLog.actor.type === ActorType.ACME_PROFILE && (
            <Tag label="acme_profile_id" value={auditLog.actor.metadata.profileId} />
          )}
          {auditLog.actor.type === ActorType.ACME_ACCOUNT && (
            <Tag label="acme_account_id" value={auditLog.actor.metadata.accountId} />
          )}
          {auditLog.actor.type === ActorType.EST_ACCOUNT && (
            <Tag label="est_profile_id" value={auditLog.actor.metadata.profileId} />
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <ChevronRight className="inline-block size-4 text-muted" />
      </TableCell>
    </TableRow>
  );
};
