import { Fragment, useState } from "react";
import { faFile } from "@fortawesome/free-solid-svg-icons";
import ms from "ms";

import {
  Button,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import { Timezone } from "@app/helpers/datetime";
import { useListAiMcpActivityLogs } from "@app/hooks/api";

import { MCPActivityLogsDateFilter } from "./MCPActivityLogsDateFilter";
import { MCPActivityLogsFilter } from "./MCPActivityLogsFilter";
import { MCPActivityLogsTableRow } from "./MCPActivityLogsTableRow";
import {
  MCPActivityLogDateFilterType,
  TMCPActivityLogDateFilterFormData,
  TMCPActivityLogFilterFormData
} from "./types";

const MCP_ACTIVITY_LOG_LIMIT = 30;

export const MCPActivityLogsTab = () => {
  const { currentProject } = useProject();
  const [timezone, setTimezone] = useState<Timezone>(Timezone.Local);
  const [logFilter, setLogFilter] = useState<TMCPActivityLogFilterFormData>({
    endpointName: undefined,
    serverName: undefined,
    toolName: undefined,
    actor: undefined
  });
  const [dateFilter, setDateFilter] = useState<TMCPActivityLogDateFilterFormData>({
    startDate: new Date(Number(new Date()) - ms("1h")),
    endDate: new Date(),
    type: MCPActivityLogDateFilterType.Relative,
    relativeModeValue: "1h"
  });

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useListAiMcpActivityLogs({
      projectId: currentProject?.id || "",
      limit: MCP_ACTIVITY_LOG_LIMIT,
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
      endpointName: logFilter.endpointName,
      serverName: logFilter.serverName,
      toolName: logFilter.toolName,
      actor: logFilter.actor
    });

  // Flatten pages into a single array
  const activityLogs = data?.pages?.flat() ?? [];
  const isEmpty = !isPending && activityLogs.length === 0;

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
        <div>
          <div className="flex items-center gap-x-2 whitespace-nowrap">
            <p className="text-xl font-medium text-mineshaft-100">Activity Logs</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <MCPActivityLogsDateFilter
            filter={dateFilter}
            setFilter={setDateFilter}
            timezone={timezone}
            setTimezone={setTimezone}
          />
          <MCPActivityLogsFilter filter={logFilter} setFilter={setLogFilter} />
        </div>
      </div>
      <div className="space-y-2">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-8" />
                <Th className="w-48">Timestamp</Th>
                <Th className="w-56">Endpoint</Th>
                <Th className="w-48">Tool</Th>
                <Th>User</Th>
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={5} innerKey="mcp-activity-logs" />}
              {!isPending &&
                activityLogs.map((log) => (
                  <Fragment key={`mcp-activity-log-${log.id}`}>
                    <MCPActivityLogsTableRow activityLog={log} />
                  </Fragment>
                ))}
              {isEmpty && (
                <Tr>
                  <td colSpan={5}>
                    <EmptyState title="No activity logs found" icon={faFile} />
                  </td>
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
            {hasNextPage ? "Load More" : "End of logs"}
          </Button>
        )}
      </div>
    </div>
  );
};
