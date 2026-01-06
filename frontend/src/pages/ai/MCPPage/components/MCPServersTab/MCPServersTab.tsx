import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { TAiMcpServer, useDeleteAiMcpServer } from "@app/hooks/api";

import { AddMCPServerModal } from "./AddMCPServerModal";
import { EditMCPServerModal } from "./EditMCPServerModal";
import { MCPServerList } from "./MCPServerList";

export const MCPServersTab = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<TAiMcpServer | null>(null);

  const deleteServer = useDeleteAiMcpServer();

  const handleAddServer = () => {
    setIsAddModalOpen(true);
  };

  const handleEditServer = (server: TAiMcpServer) => {
    setSelectedServer(server);
    setIsEditModalOpen(true);
  };

  const handleDeleteServer = (server: TAiMcpServer) => {
    setSelectedServer(server);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedServer) return;

    try {
      await deleteServer.mutateAsync({ serverId: selectedServer.id });
      createNotification({
        text: `MCP server "${selectedServer.name}" deleted successfully`,
        type: "success"
      });
    } catch (error) {
      console.error("Failed to delete MCP server:", error);
      createNotification({
        text: "Failed to delete MCP server",
        type: "error"
      });
    } finally {
      setIsDeleteModalOpen(false);
      setSelectedServer(null);
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-mineshaft-100">MCP Servers</h2>
          <p className="text-sm text-bunker-300">
            Connect to remote MCP servers like Notion, GitHub, and Slack to enable AI tool access
          </p>
        </div>

        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.McpServers}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="button"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={handleAddServer}
              isDisabled={!isAllowed}
            >
              Add MCP Server
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      <MCPServerList onEditServer={handleEditServer} onDeleteServer={handleDeleteServer} />

      <AddMCPServerModal isOpen={isAddModalOpen} onOpenChange={setIsAddModalOpen} />

      <EditMCPServerModal
        isOpen={isEditModalOpen}
        onOpenChange={(isOpen) => {
          setIsEditModalOpen(isOpen);
          if (!isOpen) {
            setSelectedServer(null);
          }
        }}
        server={selectedServer}
      />

      {selectedServer && (
        <DeleteActionModal
          isOpen={isDeleteModalOpen}
          title={`Delete MCP Server ${selectedServer.name}?`}
          onChange={(isOpen) => {
            setIsDeleteModalOpen(isOpen);
            if (!isOpen) {
              setSelectedServer(null);
            }
          }}
          deleteKey={selectedServer.name}
          onDeleteApproved={handleDeleteConfirm}
        />
      )}
    </div>
  );
};
