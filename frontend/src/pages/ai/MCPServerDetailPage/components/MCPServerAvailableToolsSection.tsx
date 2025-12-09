import { faRefresh } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  EmptyState,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useListAiMcpServerTools, useSyncAiMcpServerTools } from "@app/hooks/api";

type Props = {
  serverId: string;
};

export const MCPServerAvailableToolsSection = ({ serverId }: Props) => {
  const { data: toolsData, isPending } = useListAiMcpServerTools({ serverId });
  const syncTools = useSyncAiMcpServerTools();

  const tools = toolsData?.tools || [];

  const handleSyncTools = async () => {
    await syncTools.mutateAsync({ serverId });
  };

  return (
    <div className="flex w-full flex-col rounded-lg border border-mineshaft-600 bg-mineshaft-900">
      <div className="flex items-center justify-between border-b border-mineshaft-600 px-4 py-3">
        <div>
          <h3 className="font-medium text-mineshaft-100">Available Tools</h3>
          <p className="text-sm text-bunker-300">
            Tools provided by this MCP server that can be enabled in endpoints
          </p>
        </div>
        <Button
          variant="outline_bg"
          size="sm"
          leftIcon={<FontAwesomeIcon icon={faRefresh} />}
          onClick={handleSyncTools}
          isLoading={syncTools.isPending}
        >
          Sync Tools
        </Button>
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">Tool Name</Th>
              <Th>Description</Th>
            </Tr>
          </THead>
          <TBody>
            {isPending && (
              <Tr>
                <Td colSpan={2} className="text-center text-mineshaft-400">
                  Loading tools...
                </Td>
              </Tr>
            )}
            {!isPending && tools.length === 0 && (
              <Tr>
                <Td colSpan={2}>
                  <EmptyState title="No tools available" className="py-8" />
                </Td>
              </Tr>
            )}
            {tools.map((tool) => (
              <Tr key={tool.id} className="hover:bg-mineshaft-700">
                <Td>
                  <code className="rounded bg-mineshaft-700 px-2 py-1 font-mono text-sm text-mineshaft-200">
                    {tool.name}
                  </code>
                </Td>
                <Td className="max-w-md text-mineshaft-300">
                  {tool.description ? (
                    <Tooltip
                      content={tool.description}
                      className="max-h-96 max-w-lg overflow-y-auto"
                    >
                      <span className="line-clamp-2 cursor-help">{tool.description}</span>
                    </Tooltip>
                  ) : (
                    "-"
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );
};
