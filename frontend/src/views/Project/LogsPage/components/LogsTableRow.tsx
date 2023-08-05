import { AuditLog, Actor, Event } from "~/hooks/api/auditLogs/types";
import { ActorType, EventType } from "~/hooks/api/auditLogs/enums";
import { eventToNameMap, userAgentTTypeoNameMap } from "~/hooks/api/auditLogs/constants";
import {
    Td,
    Tr
} from "@app/components/v2";

type Props = {
    auditLog: AuditLog
}

export const LogsTableRow = ({
    auditLog
}: Props) => {
    const renderActor = (actor: Actor) => {
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
        }
    }
    
    const renderMetadata = (event: Event) => {
        switch (event.type) {
            case EventType.GET_SECRETS:
                return (
                    <Td>
                        <p>{`Environment: ${event.metadata.environment}`}</p>
                        <p>{`Path: ${event.metadata.secretPath}`}</p>
                        <p>{`# Secrets: ${event.metadata.numberOfSecrets}`}</p>
                    </Td>
                );
            case EventType.GET_SECRET:
                return (
                    <Td>
                        <p>{`Environment: ${event.metadata.environment}`}</p>
                        <p>{`Path: ${event.metadata.secretPath}`}</p>
                        <p>{`Secret: ${event.metadata.secretKey}`}</p>
                    </Td>
                );
            case EventType.CREATE_SECRET:
                return (
                    <Td>
                        <p>{`Environment: ${event.metadata.environment}`}</p>
                        <p>{`Path: ${event.metadata.secretPath}`}</p>
                        <p>{`Secret: ${event.metadata.secretKey}`}</p>
                    </Td>
                );
            case EventType.UPDATE_SECRET:
                return (
                    <Td>
                        <p>{`Environment: ${event.metadata.environment}`}</p>
                        <p>{`Path: ${event.metadata.secretPath}`}</p>
                        <p>{`Secret: ${event.metadata.secretKey}`}</p>
                    </Td>
                );
            case EventType.DELETE_SECRET:
                return (
                    <Td>
                        <p>{`Environment: ${event.metadata.environment}`}</p>
                        <p>{`Path: ${event.metadata.secretPath}`}</p>
                        <p>{`Secret: ${event.metadata.secretKey}`}</p>
                    </Td>
                );
            default:
                return (
                    <Td>Test</Td>
                ); 
        }
    }

    const formatDate = (dateToFormat: string) => {
        const date = new Date(dateToFormat);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');

        // convert from 24h to 12h format
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'

        const formattedDate = `${day}-${month}-${year} at ${hours}:${minutes} ${period}`;
        return formattedDate;
    }
    
    return (
       <Tr className={`log-${auditLog._id} h-10`}>
            <Td>{formatDate(auditLog.createdAt)}</Td>
            <Td>{`${eventToNameMap[auditLog.event.type]}`}</Td>
            {renderActor(auditLog.actor)}
            <Td>
                <p>{userAgentTTypeoNameMap[auditLog.userAgentType]}</p>
                <p>{auditLog.ipAddress}</p>
            </Td>
            {renderMetadata(auditLog.event)}
        </Tr> 
    );
}