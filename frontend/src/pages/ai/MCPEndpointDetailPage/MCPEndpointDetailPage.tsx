import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  faBan,
  faChevronLeft,
  faEllipsisV,
  faNetworkWired
} from "@fortawesome/free-solid-svg-icons";
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
import { useDeleteAiMcpEndpoint, useGetAiMcpEndpointById } from "@app/hooks/api";

import { EditMCPEndpointModal } from "../MCPPage/components/MCPEndpointsTab/EditMCPEndpointModal";
import {
  MCPEndpointConnectedServersSection,
  MCPEndpointConnectionSection,
  MCPEndpointDetailsSection,
  MCPEndpointToolSelectionSection
} from "./components";

const MCPEndpointStatusBadge = ({ status }: { status: string | null }) => {
  const statusConfig: Record<string, { color: string; label: string }> = {
    active: { color: "bg-emerald-500", label: "Active" },
    inactive: { color: "bg-red-500", label: "Inactive" }
  };

  const config = statusConfig[status || "inactive"] || statusConfig.inactive;

  return (
    <div className="flex items-center gap-2 rounded-full border border-mineshaft-500 bg-mineshaft-800 px-3 py-1">
      <div className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-sm text-mineshaft-200">{config.label}</span>
    </div>
  );
};

const PageContent = () => {
  const navigate = useNavigate();
  const params = useParams({
    strict: false
  }) as { endpointId?: string; projectId?: string; orgId?: string };

  const { endpointId, projectId, orgId } = params;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: mcpEndpoint, isPending } = useGetAiMcpEndpointById({
    endpointId: endpointId!
  });

  const deleteEndpoint = useDeleteAiMcpEndpoint();

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ContentLoader />
      </div>
    );
  }

  if (!mcpEndpoint) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <EmptyState
          className="max-w-2xl rounded-md text-center"
          icon={faBan}
          title={`Could not find MCP Endpoint with ID ${endpointId}`}
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
    if (!mcpEndpoint) return;

    try {
      await deleteEndpoint.mutateAsync({ endpointId: mcpEndpoint.id });
      createNotification({
        text: `MCP endpoint "${mcpEndpoint.name}" deleted successfully`,
        type: "success"
      });
      handleBack();
    } catch (error) {
      console.error("Failed to delete MCP endpoint:", error);
      createNotification({
        text: "Failed to delete MCP endpoint",
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
        MCP Endpoints
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
            <FontAwesomeIcon icon={faNetworkWired} className="text-xl text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">{mcpEndpoint.name}</h1>
            <p className="text-sm text-bunker-300">MCP Endpoint</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <MCPEndpointStatusBadge status={mcpEndpoint.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline_bg" size="sm">
                <FontAwesomeIcon icon={faEllipsisV} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditModalOpen(true)}>
                Edit Endpoint
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-red-500">
                Delete Endpoint
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left Column - Details, Connection, Connected Servers */}
        <div className="flex w-96 flex-col gap-4">
          <MCPEndpointDetailsSection
            endpoint={mcpEndpoint}
            onEdit={() => setIsEditModalOpen(true)}
          />
          <MCPEndpointConnectionSection endpoint={mcpEndpoint} />
          <MCPEndpointConnectedServersSection
            projectId={mcpEndpoint.projectId}
            serverIds={mcpEndpoint.serverIds}
          />
        </div>

        {/* Right Column - Tool Selection */}
        <div className="flex flex-1 flex-col gap-4">
          <MCPEndpointToolSelectionSection
            endpointId={mcpEndpoint.id}
            projectId={mcpEndpoint.projectId}
            serverIds={mcpEndpoint.serverIds}
          />
        </div>
      </div>

      <EditMCPEndpointModal
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        endpoint={mcpEndpoint}
      />

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        title={`Delete MCP Endpoint ${mcpEndpoint.name}?`}
        onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
        deleteKey={mcpEndpoint.name}
        onDeleteApproved={handleDeleteConfirm}
      />
    </div>
  );
};

export const MCPEndpointDetailPage = () => {
  return (
    <>
      <Helmet>
        <title>MCP Endpoint | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
