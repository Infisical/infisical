import { faFile } from "@fortawesome/free-solid-svg-icons";

import {
    EmptyState,
    Table,
    TableContainer,
    TableSkeleton,
    TBody,
    Td,
    Th,
    THead,
    Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetAuditLogs } from "@app/hooks/api";

import { EventType, UserAgentType } from "~/hooks/api/auditLogs/enums";

import { LogsTableRow } from "./LogsTableRow";

type Props = {
    eventType: EventType | undefined;
    userAgentType: UserAgentType | undefined;
    actor: string | undefined;
}

export const LogsTable = ({
    eventType,
    userAgentType,
    actor
}: Props) => {
    const { currentWorkspace } = useWorkspace();
    const { data, isLoading } = useGetAuditLogs(currentWorkspace?._id ?? "", {
        eventType,
        userAgentType,
        actor
    });
    
    return (
        <TableContainer>
            <Table>
                <THead>
                    <Tr>
                        <Th>Timestamp</Th>
                        <Th>Event</Th>
                        <Th>Actor</Th>
                        <Th>Source</Th>
                        <Th>Metadata</Th>
                    </Tr>
                </THead>
                <TBody>
                    {!isLoading && data && data.map((auditLog) => (
                        <LogsTableRow 
                            auditLog={auditLog} 
                            key={`audit-log-${auditLog._id}`}
                        />
                    ))}
                    {isLoading && <TableSkeleton innerKey="logs-table" columns={5} key="logs" />}
                    {!isLoading && data && data.length === 0 && (
                        <Tr>
                            <Td colSpan={5}>
                                <EmptyState 
                                    title="No audit logs on file" 
                                    icon={faFile}
                                />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}