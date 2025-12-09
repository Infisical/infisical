import { useState } from "react";
import { Helmet } from "react-helmet";
import { faBan, faChevronLeft, faEllipsisV, faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ContentLoader,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState
} from "@app/components/v2";
import { useDeleteAiMcpServer, useGetAiMcpServerById } from "@app/hooks/api";

import { EditMCPServerModal } from "../MCPPage/components/MCPServersTab/EditMCPServerModal";
import {
  MCPServerAvailableToolsSection,
  MCPServerConnectionSection,
  MCPServerCredentialsSection,
  MCPServerDetailsSection
} from "./components";

const PageContent = () => {
  const navigate = useNavigate();
  const params = useParams({
    strict: false
  }) as { serverId?: string; projectId?: string; orgId?: string };

  const { serverId, projectId, orgId } = params;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: mcpServer, isPending } = useGetAiMcpServerById(serverId!, {
    refetchInterval: 30000,
    enabled: Boolean(serverId)
  });

  const deleteServer = useDeleteAiMcpServer();

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ContentLoader />
      </div>
    );
  }

  if (!mcpServer) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <EmptyState
          className="max-w-2xl rounded-md text-center"
          icon={faBan}
          title={`Could not find MCP Server with ID ${serverId}`}
        />
      </div>
    );
  }

  const handleBack = () => {
    navigate({
      to: "/organizations/$orgId/projects/ai/$projectId/overview",
      params: { orgId: orgId!, projectId: projectId! }
    });
  };

  const handleDeleteConfirm = async () => {
    if (!mcpServer) return;

    try {
      await deleteServer.mutateAsync({ serverId: mcpServer.id });
      createNotification({
        text: `MCP server "${mcpServer.name}" deleted successfully`,
        type: "success"
      });
      handleBack();
    } catch (error) {
      console.error("Failed to delete MCP server:", error);
      createNotification({
        text: "Failed to delete MCP server",
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto flex max-w-7xl flex-col px-6 py-6 text-mineshaft-50">
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 flex items-center gap-1 text-sm text-bunker-300 hover:text-primary-400"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
        MCP Servers
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
            <FontAwesomeIcon icon={faServer} className="text-xl text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">{mcpServer.name}</h1>
            <p className="text-sm text-bunker-300">MCP Server</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" colorSchema="secondary">
                <FontAwesomeIcon icon={faEllipsisV} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditModalOpen(true)}>
                Edit Server
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-red-500">
                Delete Server
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left Column - Details, Connection, Credentials */}
        <div className="flex w-80 flex-col gap-4">
          <MCPServerDetailsSection server={mcpServer} onEdit={() => setIsEditModalOpen(true)} />
          <MCPServerConnectionSection server={mcpServer} />
          <MCPServerCredentialsSection server={mcpServer} />
        </div>

        {/* Right Column - Available Tools */}
        <div className="flex flex-1 flex-col gap-4">
          <MCPServerAvailableToolsSection serverId={mcpServer.id} />
        </div>
      </div>

      <EditMCPServerModal
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        server={mcpServer}
      />

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        title={`Delete MCP Server ${mcpServer.name}?`}
        onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
        deleteKey={mcpServer.name}
        onDeleteApproved={handleDeleteConfirm}
      />
    </div>
  );
};

export const MCPServerDetailPage = () => {
  return (
    <>
      <Helmet>
        <title>MCP Server | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
