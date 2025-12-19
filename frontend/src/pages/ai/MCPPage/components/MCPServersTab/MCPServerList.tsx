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
import { useProject } from "@app/context";
import { TAiMcpServer, useListAiMcpServers } from "@app/hooks/api";

import { MCPServerRow } from "./MCPServerRow";

interface Props {
  onEditServer: (server: TAiMcpServer) => void;
  onDeleteServer: (server: TAiMcpServer) => void;
}

export const MCPServerList = ({ onEditServer, onDeleteServer }: Props) => {
  const { currentProject } = useProject();

  const { data, isLoading } = useListAiMcpServers({
    projectId: currentProject?.id || ""
  });

  const servers = data?.servers;

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th className="w-16" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="mcp-servers" />}
          {!isLoading && (!servers || servers.length === 0) && (
            <Tr>
              <Td colSpan={3}>
                <EmptyState title="No MCP Servers" />
              </Td>
            </Tr>
          )}
          {!isLoading &&
            servers &&
            servers.length > 0 &&
            servers.map((server) => (
              <MCPServerRow
                key={server.id}
                server={server}
                onEditServer={onEditServer}
                onDeleteServer={onDeleteServer}
              />
            ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};
