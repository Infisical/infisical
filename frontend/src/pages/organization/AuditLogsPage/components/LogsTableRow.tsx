import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { AuditLog } from "@app/hooks/api/auditLogs/types";

type Props = {
  auditLog: AuditLog;
};

type TagProps = {
  label: string;
  value?: string;
};
const Tag = ({ label, value }: TagProps) => {
  if (!value) return null;

  return (
    <div className="flex items-center space-x-2">
      <div className="rounded bg-bunker-800 p-1 py-0.5 font-mono">{label}: </div>
      <div>{value}</div>
    </div>
  );
};

export const LogsTableRow = ({ auditLog }: Props) => {
  const [isOpen, setIsOpen] = useToggle();

  return (
    <>
      <Tr
        className="h-10 cursor-pointer border-x-0 border-b border-t-0"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen.toggle()}
        onKeyDown={(evt) => {
          if (evt.key === "Enter") setIsOpen.toggle();
        }}
        isHoverable
      >
        <Td className="align-top">
          <FontAwesomeIcon icon={isOpen ? faCaretDown : faCaretRight} />
        </Td>
        <Td className="align-top">
          {format(new Date(auditLog.createdAt), "MMM do yyyy, hh:mm a")}
        </Td>
        <Td>
          <div className="flex flex-wrap gap-2 text-sm">
            <Tag label="event" value={auditLog.event.type} />
            <Tag label="actor" value={auditLog.actor.type} />
            {auditLog.actor.type === ActorType.USER && (
              <>
                <Tag label="user_email" value={auditLog.actor.metadata.email} />
                <Tag label="user_id" value={auditLog.actor.metadata.userId} />
              </>
            )}
            {auditLog.actor.type === ActorType.IDENTITY && (
              <>
                <Tag label="identity_name" value={auditLog.actor.metadata.name} />
                <Tag label="identity_id" value={auditLog.actor.metadata.identityId} />
              </>
            )}
            {auditLog.projectId && auditLog.projectName && (
              <>
                <Tag label="project_name" value={auditLog.projectName} />
                <Tag label="project_id" value={auditLog.projectId} />
              </>
            )}
            <Tag label="ip" value={auditLog.ipAddress} />
            <Tag label="agent" value={auditLog.userAgent} />
          </div>
        </Td>
      </Tr>
      {isOpen && (
        <Tr className={`log-${auditLog.id} h-10 border-x-0 border-b border-t-0`}>
          <Td colSpan={3}>
            <div className="thin-scrollbar my-1 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-bunker-800 p-2 font-mono leading-6">
              {JSON.stringify(auditLog, null, 4)}
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};
