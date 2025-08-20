import {
  faBan,
  faCaretDown,
  faCaretRight,
  faCheck,
  faExclamationCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, Td, Tr } from "@app/components/v2";
import { formatDateTime, Timezone } from "@app/helpers/datetime";
import { useToggle } from "@app/hooks";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ApiShieldRequestEvent, AuditLog } from "@app/hooks/api/auditLogs/types";

type Props = {
  request: AuditLog;
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
      <div className="rounded bg-mineshaft-600 p-0.5 pl-1 font-mono">{label}:</div>
      <div>{value}</div>
    </div>
  );
};

export const BridgeRequestsTableRow = ({ request, rowNumber, timezone }: Props) => {
  const [isOpen, setIsOpen] = useToggle();

  return (
    <>
      <Tr
        className="h-10 cursor-pointer border-x-0 border-b border-t-0 hover:bg-mineshaft-700"
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
        <Td className="align-top">{formatDateTime({ timestamp: request.createdAt, timezone })}</Td>
        <Td>
          <div className="flex flex-wrap gap-4 text-sm">
            <Tag label="actor" value={request.actor.type} />
            {request.actor.type === ActorType.USER && (
              <Tag label="user_email" value={request.actor.metadata.email} />
            )}
            {request.actor.type === ActorType.IDENTITY && (
              <Tag label="identity_name" value={request.actor.metadata.name} />
            )}
            {(request.event as ApiShieldRequestEvent).metadata?.result === "PASSED" ? (
              <Badge
                variant="success"
                className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
              >
                <FontAwesomeIcon icon={faCheck} />
                <span>Pass</span>
              </Badge>
            ) : (
              <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-red-400/50 text-red-300">
                <FontAwesomeIcon icon={faBan} />
                <span>Blocked</span>
              </Badge>
            )}
            {(request.event as ApiShieldRequestEvent).metadata?.suspicious && (
              <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-yellow-400/50 text-yellow-300">
                <FontAwesomeIcon icon={faExclamationCircle} />
                <span>Suspicious</span>
              </Badge>
            )}
          </div>
        </Td>
      </Tr>
      {isOpen && (
        <Tr className={`request-${request.id} h-10 border-x-0 border-b border-t-0`}>
          <Td colSpan={3} className="px-3 py-2">
            <div className="thin-scrollbar my-1 max-h-96 overflow-auto whitespace-pre-wrap rounded border border-mineshaft-600 bg-bunker-800 p-2 font-mono leading-6">
              {JSON.stringify(request, null, 4)}
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};
