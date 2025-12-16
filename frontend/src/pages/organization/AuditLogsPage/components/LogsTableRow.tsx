import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InfoIcon } from "lucide-react";

import { Td, Tooltip, Tr } from "@app/components/v2";
import { formatDateTime, Timezone } from "@app/helpers/datetime";
import { useToggle } from "@app/hooks";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { AuditLog } from "@app/hooks/api/auditLogs/types";

type Props = {
  auditLog: AuditLog;
  rowNumber: number;
  timezone: Timezone;
};

type TagProps = {
  label: string;
  value?: string;
};
const Tag = ({ label, value }: TagProps) => {
  if (!value) return null;

  return (
    <div className="flex items-center space-x-1.5">
      <div className="rounded-sm bg-mineshaft-600 p-0.5 pl-1 font-mono">{label}:</div>
      <div>{value}</div>
      {value === "unknownUser" && (
        <Tooltip
          side="right"
          className="max-w-sm"
          content="This action doesn't require authentication, so the requesting actor cannot be identified."
        >
          <InfoIcon size={14} className="text-mineshaft-300" />
        </Tooltip>
      )}
    </div>
  );
};

export const LogsTableRow = ({ auditLog, rowNumber, timezone }: Props) => {
  const [isOpen, setIsOpen] = useToggle();

  return (
    <>
      <Tr
        className="h-10 cursor-pointer border-x-0 border-t-0 border-b hover:bg-mineshaft-700"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen.toggle()}
        onKeyDown={(evt) => {
          if (evt.key === "Enter") setIsOpen.toggle();
        }}
        isHoverable
      >
        <Td className="flex items-center gap-2 pr-0 align-top">
          <FontAwesomeIcon icon={isOpen ? faCaretDown : faCaretRight} />
          {rowNumber}
        </Td>
        <Td className="align-top">{formatDateTime({ timestamp: auditLog.createdAt, timezone })}</Td>
        <Td>
          <div className="flex flex-wrap gap-4 text-sm">
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
          </div>
        </Td>
      </Tr>
      {isOpen && (
        <Tr className={`log-${auditLog.id} h-10 border-x-0 border-t-0 border-b`}>
          <Td colSpan={3} className="px-3 py-2">
            <div className="my-1 max-h-96 thin-scrollbar overflow-auto rounded-sm border border-mineshaft-600 bg-bunker-800 p-2 font-mono leading-6 whitespace-pre-wrap">
              {JSON.stringify(auditLog, null, 4)}
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};
