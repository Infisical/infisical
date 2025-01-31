import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Td, Tooltip, Tr } from "@app/components/v2";
import { eventToNameMap, userAgentTTypeoNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType } from "@app/hooks/api/auditLogs/enums";
import { Actor, AuditLog } from "@app/hooks/api/auditLogs/types";

type Props = {
  auditLog: AuditLog;
  isOrgAuditLogs?: boolean;
  showActorColumn: boolean;
};

export const LogsTableRow = ({ auditLog, isOrgAuditLogs, showActorColumn }: Props) => {
  const renderActor = (actor: Actor) => {
    if (!actor) {
      return <Td />;
    }

    switch (actor.type) {
      case ActorType.USER:
        return (
          <Td>
            <p>{actor.metadata.email}</p>
            <p>User</p>
          </Td>
        );
      case ActorType.SERVICE:
        return (
          <Td>
            <p>{`${actor.metadata.name}`}</p>
            <p>Service token</p>
          </Td>
        );
      case ActorType.IDENTITY:
        return (
          <Td>
            <p>{`${actor.metadata.name}`}</p>
            <p>Machine Identity</p>
          </Td>
        );
      case ActorType.PLATFORM:
        return (
          <Td>
            <p>Platform</p>
          </Td>
        );
      case ActorType.UNKNOWN_USER:
        return (
          <Td>
            <div className="flex items-center gap-2">
              <p>Unknown User</p>
              <Tooltip content="This action was performed by a user who was not authenticated at the time.">
                <FontAwesomeIcon className="text-mineshaft-400" icon={faQuestionCircle} />
              </Tooltip>
            </div>
          </Td>
        );
      default:
        return <Td />;
    }
  };

  const formatDate = (dateToFormat: string) => {
    const date = new Date(dateToFormat);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");

    // convert from 24h to 12h format
    const period = hours >= 12 ? "PM" : "AM";
    hours %= 12;
    hours = hours || 12; // the hour '0' should be '12'

    const formattedDate = `${day}-${month}-${year} at ${hours}:${minutes} ${period}`;
    return formattedDate;
  };

  const renderSource = () => {
    const { event, actor } = auditLog;

    if (event.type === EventType.INTEGRATION_SYNCED) {
      if (actor.type === ActorType.USER) {
        return (
          <Td>
            <p>Manually triggered by {actor.metadata.email}</p>
          </Td>
        );
      }

      // Platform / automatic syncs
      return (
        <Td>
          <p>Automatically synced by Infisical</p>
        </Td>
      );
    }

    return (
      <Td>
        <p>{userAgentTTypeoNameMap[auditLog.userAgentType]}</p>
        <p>{auditLog.ipAddress}</p>
      </Td>
    );
  };

  return (
    <Tr className={`log-${auditLog.id} h-10 border-x-0 border-b border-t-0`}>
      <Td>{formatDate(auditLog.createdAt)}</Td>
      <Td>{`${eventToNameMap[auditLog.event.type]}`}</Td>
      {isOrgAuditLogs && <Td>{auditLog?.projectName ?? auditLog?.projectId ?? "N/A"}</Td>}
      {showActorColumn && renderActor(auditLog.actor)}
      {renderSource()}
      <Td className="max-w-xs break-all">{JSON.stringify(auditLog.event.metadata || {})}</Td>
    </Tr>
  );
};
