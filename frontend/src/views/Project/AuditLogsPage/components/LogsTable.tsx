import { faFile } from "@fortawesome/free-solid-svg-icons";

import {
    EmptyState,
    Pagination,
    Table,
    TableContainer,
    TableSkeleton,
    TBody,
    Td,
    Th,
    THead,
    Tr} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetAuditLogs } from "@app/hooks/api";
import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";

import { LogsTableRow } from "./LogsTableRow";
import { SetValueType } from "./types";

type Props = {
    eventType?: EventType;
    userAgentType?: UserAgentType;
    actor?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    perPage: number;
    setValue: SetValueType;
}

export const LogsTable = ({
    eventType,
    userAgentType,
    actor,
    startDate,
    endDate,
    page,
    perPage,
    setValue
}: Props) => {
    const { currentWorkspace } = useWorkspace();
    const { data, isLoading } = useGetAuditLogs(currentWorkspace?._id ?? "", {
        eventType,
        userAgentType,
        actor,
        startDate,
        endDate,
        offset: (page - 1) * perPage,
        limit: perPage
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
                    {!isLoading && data?.auditLogs && data?.auditLogs.map((auditLog) => (
                        <LogsTableRow 
                            auditLog={auditLog} 
                            key={`audit-log-${auditLog._id}`}
                        />
                    ))}
                    {isLoading && <TableSkeleton innerKey="logs-table" columns={5} key="logs" />}
                    {!isLoading && data?.auditLogs && data?.auditLogs.length === 0 && (
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
            {!isLoading && data?.totalCount !== undefined && (
                <Pagination 
                    count={data?.totalCount}
                    page={page}
                    perPage={perPage}
                    onChangePage={(newPage) => setValue("page", newPage)}
                    onChangePerPage={(newPerPage) => setValue("perPage", newPerPage)}
                />
            )}
        </TableContainer>
    );
}