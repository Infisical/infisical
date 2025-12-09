import { useMemo, useState } from "react";
import {
  faChevronDown,
  faChevronUp,
  faInfoCircle,
  faMagnifyingGlass,
  faServer
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Input, Switch, Tooltip } from "@app/components/v2";
import {
  TAiMcpEndpointToolConfig,
  useDisableEndpointTool,
  useEnableEndpointTool,
  useListAiMcpServers,
  useListAiMcpServerTools,
  useListEndpointTools
} from "@app/hooks/api";

type Props = {
  endpointId: string;
  projectId: string;
  serverIds: string[];
};

type ServerToolsSectionProps = {
  serverId: string;
  serverName: string;
  serverStatus: string;
  searchQuery: string;
  toolConfigs: TAiMcpEndpointToolConfig[];
  onToolToggle: (serverToolId: string, isEnabled: boolean) => void;
  isUpdating: boolean;
};

const ServerToolsSection = ({
  serverId,
  serverName,
  serverStatus,
  searchQuery,
  toolConfigs,
  onToolToggle,
  isUpdating
}: ServerToolsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: toolsData } = useListAiMcpServerTools({ serverId });
  const tools = toolsData?.tools || [];

  // Create a set of enabled tool IDs for quick lookup
  // Presence in the list = enabled, absence = disabled
  const enabledToolIds = useMemo(() => {
    return new Set(toolConfigs.map((config) => config.aiMcpServerToolId));
  }, [toolConfigs]);

  // Filter tools based on search query
  const filteredTools = tools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tool.description && tool.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Count enabled tools
  const enabledCount = tools.filter((tool) => enabledToolIds.has(tool.id)).length;
  const totalCount = tools.length;

  // Check if tool is enabled
  const isToolEnabled = (toolId: string) => {
    return enabledToolIds.has(toolId);
  };

  if (filteredTools.length === 0 && searchQuery) {
    return null; // Hide section if no tools match search
  }

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-mineshaft-700"
      >
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faServer} className="text-sm text-bunker-400" />
          <span className="text-sm text-mineshaft-200">{serverName}</span>
          <div
            className={`h-2 w-2 rounded-full ${
              serverStatus === "active" ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
            {enabledCount}/{totalCount} Enabled
          </span>
          <FontAwesomeIcon
            icon={isExpanded ? faChevronUp : faChevronDown}
            className="text-xs text-bunker-400"
          />
        </div>
      </button>

      {isExpanded && filteredTools.length > 0 && (
        <div className="border-t border-mineshaft-600">
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-mineshaft-600 px-4 py-2 text-xs font-medium tracking-wider text-bunker-300 uppercase">
            <span>Tool Name</span>
            <span>Enabled</span>
          </div>
          <div className="divide-y divide-mineshaft-600">
            {filteredTools.map((tool) => (
              <div key={tool.id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-mineshaft-200">{tool.name}</span>
                  {tool.description && (
                    <Tooltip content={tool.description}>
                      <FontAwesomeIcon
                        icon={faInfoCircle}
                        className="text-xs text-bunker-400 hover:text-bunker-300"
                      />
                    </Tooltip>
                  )}
                </div>
                <Switch
                  id={`tool-${tool.id}`}
                  isChecked={isToolEnabled(tool.id)}
                  onCheckedChange={(checked) => onToolToggle(tool.id, checked)}
                  isDisabled={isUpdating}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {isExpanded && tools.length === 0 && (
        <div className="border-t border-mineshaft-600 px-4 py-4 text-center text-sm text-bunker-400">
          No tools available from this server
        </div>
      )}
    </div>
  );
};

export const MCPEndpointToolSelectionSection = ({ endpointId, projectId, serverIds }: Props) => {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: serversData } = useListAiMcpServers({ projectId });
  const { data: toolConfigs = [] } = useListEndpointTools({ endpointId });
  const enableTool = useEnableEndpointTool();
  const disableTool = useDisableEndpointTool();

  const connectedServers =
    serversData?.servers.filter((server) => serverIds.includes(server.id)) || [];

  const handleToolToggle = async (serverToolId: string, isEnabled: boolean) => {
    try {
      if (isEnabled) {
        await enableTool.mutateAsync({ endpointId, serverToolId });
      } else {
        await disableTool.mutateAsync({ endpointId, serverToolId });
      }
    } catch (error) {
      console.error("Failed to update tool:", error);
      createNotification({
        text: "Failed to update tool configuration",
        type: "error"
      });
    }
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-4">
      <div>
        <h3 className="text-lg font-medium text-mineshaft-100">Tool Selection</h3>
        <p className="mt-1 text-sm text-bunker-300">
          Control which tools from connected MCP servers are available through this endpoint
        </p>
      </div>

      <div className="relative">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute top-1/2 left-3 z-10 -translate-y-1/2 text-bunker-400"
        />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools..."
          className="pl-10"
        />
      </div>

      <div className="space-y-3">
        {connectedServers.length === 0 ? (
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 px-4 py-8 text-center">
            <FontAwesomeIcon icon={faServer} className="mb-2 text-2xl text-bunker-400" />
            <p className="text-sm text-bunker-400">No MCP servers connected to this endpoint</p>
            <p className="mt-1 text-xs text-bunker-400">
              Connect servers to configure available tools
            </p>
          </div>
        ) : (
          connectedServers.map((server) => (
            <ServerToolsSection
              key={server.id}
              serverId={server.id}
              serverName={server.name}
              serverStatus={server.status}
              searchQuery={searchQuery}
              toolConfigs={toolConfigs}
              onToolToggle={handleToolToggle}
              isUpdating={enableTool.isPending || disableTool.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
};
