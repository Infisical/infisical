import { Fragment } from "react";
import { Ban, FileText, Loader2Icon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Timezone } from "@app/helpers/datetime";
import { usePopUp, useScopeVariant } from "@app/hooks";
import { useFetchServerStatus, useGetAuditLogs } from "@app/hooks/api";
import { TGetAuditLogsFilter } from "@app/hooks/api/auditLogs/types";

import { AuditLogDetailsSheet } from "./AuditLogDetailsSheet";
import { LogsTableRow } from "./LogsTableRow";

type Props = {
  filter: TGetAuditLogsFilter;
  refetchInterval?: number;
  timezone: Timezone;
};

const AUDIT_LOG_LIMIT = 30;

export const LogsTable = ({ filter, refetchInterval, timezone }: Props) => {
  const { data: status } = useFetchServerStatus();
  const scopeVariant = useScopeVariant();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["logDetails"] as const);

  // Determine the project ID for filtering
  const filterProjectId =
    // Use the projectId from the filter if it exists
    filter?.projectId || null;

  const { data, isPending, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useGetAuditLogs(
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

  if (isEmpty) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {status?.auditLogStorageDisabled ? <Ban /> : <FileText />}
          </EmptyMedia>
          <EmptyTitle>
            {status?.auditLogStorageDisabled
              ? "Audit log storage is disabled"
              : "No audit logs on file"}
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">
              <span>
                {isLoading && <Loader2Icon className="size-3.5 animate-spin text-muted" />}
              </span>
            </TableHead>
            <TableHead className="w-64">Timestamp</TableHead>
            <TableHead>Event</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isPending &&
            data?.pages?.map((group, i) => (
              <Fragment key={`audit-log-fragment-${i + 1}`}>
                {group.map((auditLog, index) => (
                  <LogsTableRow
                    rowNumber={index + i * AUDIT_LOG_LIMIT + 1}
                    auditLog={auditLog}
                    key={`audit-log-${auditLog.id}`}
                    timezone={timezone}
                    onClick={(log) => handlePopUpOpen("logDetails", log)}
                  />
                ))}
              </Fragment>
            ))}
          {isPending &&
            Array.from({ length: 8 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <TableRow key={`logs-skeleton-${i + 1}`}>
                <TableCell>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {!isPending && (
        <Button
          className="mt-4"
          isFullWidth
          variant={scopeVariant}
          isPending={isFetchingNextPage}
          isDisabled={isFetchingNextPage || !hasNextPage}
          onClick={() => fetchNextPage()}
        >
          {hasNextPage ? `Load More (${totalLoaded} loaded)` : `End of logs (${totalLoaded} total)`}
        </Button>
      )}
      <AuditLogDetailsSheet
        isOpen={popUp.logDetails.isOpen}
        onOpenChange={(open) => handlePopUpToggle("logDetails", open)}
        auditLog={popUp.logDetails.data}
        timezone={timezone}
      />
    </div>
  );
};
