import { Fragment } from "react";
import { faCancel, faFile } from "@fortawesome/free-solid-svg-icons";
import { twMerge } from "tailwind-merge";

import {
  Button,
  EmptyState,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { Timezone } from "@app/helpers/datetime";
import { useFetchServerStatus, useGetAuditLogs } from "@app/hooks/api";
import { TGetAuditLogsFilter } from "@app/hooks/api/auditLogs/types";

import { LogsTableRow } from "./LogsTableRow";

type Props = {
  filter: TGetAuditLogsFilter;
  refetchInterval?: number;
  timezone: Timezone;
};

const AUDIT_LOG_LIMIT = 30;

export const LogsTable = ({ filter, refetchInterval, timezone }: Props) => {
  const { data: status } = useFetchServerStatus();

  // Determine the project ID for filtering
  const filterProjectId =
    // Use the projectId from the filter if it exists
    filter?.projectId || null;

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useGetAuditLogs(
    {
      ...filter,
      limit: AUDIT_LOG_LIMIT
    },
    filterProjectId,
    {
      refetchInterval
    }
  );

  const isEmpty = !isPending && !data?.pages?.[0].length;
  const totalLoaded = data?.pages?.reduce((sum, page) => sum + page.length, 0) ?? 0;

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th className="w-24">
                <Spinner size="xs" className={twMerge(isPending ? "opacity-100" : "opacity-0")} />
              </Th>
              <Th className="w-64">Timestamp</Th>
              <Th>Event</Th>
            </Tr>
          </THead>
          <TBody>
            {!isPending &&
              data?.pages?.map((group, i) => (
                <Fragment key={`audit-log-fragment-${i + 1}`}>
                  {group.map((auditLog, index) => (
                    <LogsTableRow
                      rowNumber={index + i * AUDIT_LOG_LIMIT + 1}
                      auditLog={auditLog}
                      key={`audit-log-${auditLog.id}`}
                      timezone={timezone}
                    />
                  ))}
                </Fragment>
              ))}
            {isPending && <TableSkeleton innerKey="logs-table" columns={3} key="logs-loading" />}
            {isEmpty && (
              <Tr>
                <Td colSpan={3}>
                  {status?.auditLogStorageDisabled ? (
                    <EmptyState title="Audit log storage is disabled" icon={faCancel} />
                  ) : (
                    <EmptyState title="No audit logs on file" icon={faFile} />
                  )}
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      {!isEmpty && (
        <Button
          className="mt-4 px-4 py-3 text-sm"
          isFullWidth
          variant="outline_bg"
          isLoading={isFetchingNextPage}
          isDisabled={isFetchingNextPage || !hasNextPage}
          onClick={() => fetchNextPage()}
        >
          {hasNextPage ? `Load More (${totalLoaded} loaded)` : `End of logs (${totalLoaded} total)`}
        </Button>
      )}
    </div>
  );
};
