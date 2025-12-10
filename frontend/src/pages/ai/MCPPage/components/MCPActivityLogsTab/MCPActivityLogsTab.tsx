import { Fragment, useState } from "react";
import { faFile, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  EmptyState,
  Input,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useListAiMcpActivityLogs } from "@app/hooks/api";

import { MCPActivityLogsFilter, TMCPActivityLogFilter } from "./MCPActivityLogsFilter";
import { MCPActivityLogsTableRow } from "./MCPActivityLogsTableRow";

export const MCPActivityLogsTab = () => {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<TMCPActivityLogFilter>({
    endpoint: undefined,
    tool: undefined,
    user: undefined
  });

  const { data: activityLogs = [], isPending: isLoading } = useListAiMcpActivityLogs({
    projectId: currentProject?.id || ""
  });

  // Filter logs based on search and filter state
  const filteredLogs = activityLogs.filter((log) => {
    const matchesSearch =
      searchQuery === "" ||
      log.toolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.endpointName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actor.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesEndpoint = !filter.endpoint || log.endpointName === filter.endpoint;
    const matchesTool = !filter.tool || log.toolName === filter.tool;
    const matchesUser = !filter.user || log.actor === filter.user;

    return matchesSearch && matchesEndpoint && matchesTool && matchesUser;
  });

  const isEmpty = !isLoading && filteredLogs.length === 0;
  const hasMore = false; // Pagination not implemented yet

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
        <div>
          <div className="flex items-center gap-x-2 whitespace-nowrap">
            <p className="text-xl font-semibold text-mineshaft-100">Activity Logs</p>
          </div>
          <p className="text-sm text-bunker-300">
            Monitor tool invocations and endpoint usage across your MCP infrastructure
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <MCPActivityLogsFilter
            filter={filter}
            setFilter={setFilter}
            activityLogs={activityLogs}
          />
        </div>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faSearch} className="text-mineshaft-400" />}
          className="w-full bg-mineshaft-800"
        />
      </div>

      <div>
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
              {isLoading && <TableSkeleton columns={5} innerKey="mcp-activity-logs" />}
              {!isLoading &&
                filteredLogs.map((log) => (
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
        {!isEmpty && hasMore && (
          <Button
            className="mt-4 px-4 py-3 text-sm"
            isFullWidth
            variant="outline_bg"
            isLoading={false}
            isDisabled={!hasMore}
            onClick={() => {
              // Pagination will be implemented later
            }}
          >
            Load More
          </Button>
        )}
      </div>
    </div>
  );
};
