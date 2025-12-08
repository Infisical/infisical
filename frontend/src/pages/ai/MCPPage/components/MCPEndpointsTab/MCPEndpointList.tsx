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
import { TAiMcpEndpoint, useListAiMcpEndpoints } from "@app/hooks/api";

import { MCPEndpointRow } from "./MCPEndpointRow";

interface Props {
  onEditEndpoint: (endpoint: TAiMcpEndpoint) => void;
  onDeleteEndpoint: (endpoint: TAiMcpEndpoint) => void;
}

export const MCPEndpointList = ({ onEditEndpoint, onDeleteEndpoint }: Props) => {
  const { currentProject } = useProject();

  const { data, isLoading } = useListAiMcpEndpoints({
    projectId: currentProject?.id || ""
  });

  const endpoints = data?.endpoints;

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th>Connected Servers</Th>
            <Th>Active Tools</Th>
            <Th className="w-16" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={5} innerKey="mcp-endpoints" />}
          {!isLoading && (!endpoints || endpoints.length === 0) && (
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No MCP Endpoints" />
              </Td>
            </Tr>
          )}
          {!isLoading &&
            endpoints &&
            endpoints.length > 0 &&
            endpoints.map((endpoint) => (
              <MCPEndpointRow
                key={endpoint.id}
                endpoint={endpoint}
                onEditEndpoint={onEditEndpoint}
                onDeleteEndpoint={onDeleteEndpoint}
              />
            ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};
