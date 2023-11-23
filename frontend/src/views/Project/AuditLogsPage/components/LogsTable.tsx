import { Fragment } from "react";
import { faFile } from "@fortawesome/free-solid-svg-icons";

import {
  Button,
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
import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";

import { LogsTableRow } from "./LogsTableRow";

type Props = {
  eventType?: EventType;
  userAgentType?: UserAgentType;
  actor?: string;
  startDate?: Date;
  endDate?: Date;
};

const AUDIT_LOG_LIMIT = 15;

export const LogsTable = ({ eventType, userAgentType, actor, startDate, endDate }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useGetAuditLogs(
    currentWorkspace?._id ?? "",
    {
      eventType,
      userAgentType,
      actor,
      startDate,
      endDate,
      limit: AUDIT_LOG_LIMIT
    }
  );

  const isEmpty = !isLoading && !data?.pages?.[0].length;

  return (
    <div>
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
            {!isLoading &&
              data?.pages?.map((group, i) => (
                <Fragment key={`auditlog-item-${i + 1}`}>
                  {group.map((auditLog) => (
                    <LogsTableRow auditLog={auditLog} key={`audit-log-${auditLog._id}`} />
                  ))}
                </Fragment>
              ))}
            {isLoading && <TableSkeleton innerKey="logs-table" columns={5} key="logs" />}
            {isEmpty && (
              <Tr>
                <Td colSpan={5}>
                  <EmptyState title="No audit logs on file" icon={faFile} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      {!isEmpty && (
        <Button
          className="mt-4 mb-20 py-3 px-4 text-sm"
          isFullWidth
          variant="star"
          isLoading={isFetchingNextPage}
          isDisabled={isFetchingNextPage || !hasNextPage}
          onClick={() => fetchNextPage()}
        >
          {hasNextPage ? "Load More" : "End of logs"}
        </Button>
      )}
    </div>
  );
};
