import { faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useListAiMcpServers } from "@app/hooks/api";

type Props = {
  projectId: string;
  serverIds: string[];
};

export const MCPEndpointConnectedServersSection = ({ projectId, serverIds }: Props) => {
  const { data: serversData } = useListAiMcpServers({ projectId });

  const connectedServers =
    serversData?.servers.filter((server) => serverIds.includes(server.id)) || [];

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Connected MCP Servers</h3>
      </div>
      <div className="space-y-2">
        {connectedServers.length === 0 ? (
          <p className="py-2 text-sm text-bunker-400">No servers connected</p>
        ) : (
          connectedServers.map((server) => (
            <div
              key={server.id}
              className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-mineshaft-700"
            >
              <FontAwesomeIcon icon={faServer} className="text-sm text-bunker-400" />
              <div className="flex-1">
                <p className="text-sm text-mineshaft-200">{server.name}</p>
                {server.description && (
                  <p className="text-xs text-bunker-400">{server.description}</p>
                )}
              </div>
              <div
                className={`h-2 w-2 rounded-full ${
                  server.status === "active" ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
