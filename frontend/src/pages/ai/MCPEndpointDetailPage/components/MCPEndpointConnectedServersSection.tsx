import { useState } from "react";
import { faCheck, faPencil, faServer, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, IconButton, Spinner } from "@app/components/v2";
import { useListAiMcpServers, useUpdateAiMcpEndpoint } from "@app/hooks/api";

type Props = {
  endpointId: string;
  projectId: string;
  serverIds: string[];
};

export const MCPEndpointConnectedServersSection = ({ endpointId, projectId, serverIds }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>(serverIds);

  const { data: serversData, isLoading: isLoadingServers } = useListAiMcpServers({ projectId });
  const updateEndpoint = useUpdateAiMcpEndpoint();

  const servers = serversData?.servers || [];
  const connectedServers = servers.filter((server) => serverIds.includes(server.id));

  const handleServerToggle = (serverId: string) => {
    setSelectedServerIds((current) =>
      current.includes(serverId) ? current.filter((id) => id !== serverId) : [...current, serverId]
    );
  };

  const handleStartEdit = () => {
    setSelectedServerIds(serverIds);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setSelectedServerIds(serverIds);
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      await updateEndpoint.mutateAsync({
        endpointId,
        serverIds: selectedServerIds
      });

      createNotification({
        text: "Connected servers updated successfully",
        type: "success"
      });

      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update connected servers:", error);
      createNotification({
        text: "Failed to update connected servers",
        type: "error"
      });
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Connected MCP Servers</h3>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <IconButton
              ariaLabel="Cancel"
              variant="plain"
              size="sm"
              onClick={handleCancel}
              isDisabled={updateEndpoint.isPending}
            >
              <FontAwesomeIcon
                icon={faTimes}
                className="text-bunker-300 hover:text-mineshaft-100"
              />
            </IconButton>
            <IconButton
              ariaLabel="Save"
              variant="plain"
              size="sm"
              onClick={handleSave}
              isDisabled={updateEndpoint.isPending}
            >
              {updateEndpoint.isPending ? (
                <Spinner size="xs" />
              ) : (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="text-primary-500 hover:text-primary-400"
                />
              )}
            </IconButton>
          </div>
        ) : (
          <IconButton
            ariaLabel="Edit connected servers"
            variant="plain"
            size="sm"
            onClick={handleStartEdit}
          >
            <FontAwesomeIcon icon={faPencil} className="text-bunker-300 hover:text-mineshaft-100" />
          </IconButton>
        )}
      </div>
      <div className="space-y-2">
        {isEditing && (
          <>
            {isLoadingServers && <p className="text-sm text-bunker-400">Loading servers...</p>}
            {!isLoadingServers && servers.length === 0 && (
              <div className="flex flex-col items-center py-4 text-center">
                <FontAwesomeIcon icon={faServer} className="mb-2 text-2xl text-bunker-400" />
                <p className="text-sm text-bunker-400">No MCP servers available</p>
                <p className="text-xs text-bunker-500">
                  Add MCP servers first to connect them to this endpoint
                </p>
              </div>
            )}
            {!isLoadingServers &&
              servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-mineshaft-700"
                >
                  <Checkbox
                    id={`server-${server.id}`}
                    className="mt-0.5"
                    isChecked={selectedServerIds.includes(server.id)}
                    onCheckedChange={() => handleServerToggle(server.id)}
                    isDisabled={updateEndpoint.isPending}
                  />
                  <label
                    htmlFor={`server-${server.id}`}
                    className="flex flex-1 cursor-pointer items-start gap-2"
                  >
                    <FontAwesomeIcon icon={faServer} className="mt-0.5 text-sm text-bunker-400" />
                    <div className="flex-1">
                      <p className="text-sm text-mineshaft-200">{server.name}</p>
                      {server.description && (
                        <p className="text-xs text-bunker-400">{server.description}</p>
                      )}
                    </div>
                  </label>
                  <div
                    className={`mt-1 h-2 w-2 rounded-full ${
                      server.status === "active" ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                </div>
              ))}
            {selectedServerIds.length > 0 && (
              <p className="mt-1 text-xs text-bunker-400">
                {selectedServerIds.length} server{selectedServerIds.length !== 1 ? "s" : ""}{" "}
                selected
              </p>
            )}
          </>
        )}
        {!isEditing && connectedServers.length === 0 && (
          <p className="py-2 text-sm text-bunker-400">No servers connected</p>
        )}
        {!isEditing &&
          connectedServers.length > 0 &&
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
          ))}
      </div>
    </div>
  );
};
