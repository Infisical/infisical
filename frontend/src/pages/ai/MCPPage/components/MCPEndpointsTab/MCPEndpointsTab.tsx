import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionMcpEndpointActions,
  ProjectPermissionSub,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { TAiMcpEndpoint, useDeleteAiMcpEndpoint } from "@app/hooks/api";

import { AddMCPEndpointModal } from "./AddMCPEndpointModal";
import { EditMCPEndpointModal } from "./EditMCPEndpointModal";
import { MCPEndpointList } from "./MCPEndpointList";

export const MCPEndpointsTab = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<TAiMcpEndpoint | null>(null);

  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"]);
  const deleteEndpoint = useDeleteAiMcpEndpoint();

  const handleCreateEndpoint = () => {
    if (subscription && !subscription.ai) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to Infisical AI. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
      return;
    }
    setIsCreateModalOpen(true);
  };

  const handleEditEndpoint = (endpoint: TAiMcpEndpoint) => {
    setSelectedEndpoint(endpoint);
    setIsEditModalOpen(true);
  };

  const handleDeleteEndpoint = (endpoint: TAiMcpEndpoint) => {
    setSelectedEndpoint(endpoint);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedEndpoint) return;

    try {
      await deleteEndpoint.mutateAsync({ endpointId: selectedEndpoint.id });
      createNotification({
        text: `MCP endpoint "${selectedEndpoint.name}" deleted successfully`,
        type: "success"
      });
    } catch (error) {
      console.error("Failed to delete MCP endpoint:", error);
      createNotification({
        text: "Failed to delete MCP endpoint",
        type: "error"
      });
    } finally {
      setIsDeleteModalOpen(false);
      setSelectedEndpoint(null);
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-mineshaft-100">MCP Endpoints</h2>
          <p className="text-sm text-bunker-300">
            Create connection URLs that AI clients like Claude can use to access your MCP servers
          </p>
        </div>

        <ProjectPermissionCan
          I={ProjectPermissionMcpEndpointActions.Create}
          a={ProjectPermissionSub.McpEndpoints}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="button"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={handleCreateEndpoint}
              isDisabled={!isAllowed}
            >
              Create Endpoint
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      <MCPEndpointList
        onEditEndpoint={handleEditEndpoint}
        onDeleteEndpoint={handleDeleteEndpoint}
      />

      <AddMCPEndpointModal isOpen={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />

      <EditMCPEndpointModal
        isOpen={isEditModalOpen}
        onOpenChange={(isOpen) => {
          setIsEditModalOpen(isOpen);
          if (!isOpen) {
            setSelectedEndpoint(null);
          }
        }}
        endpoint={selectedEndpoint}
      />

      {selectedEndpoint && (
        <DeleteActionModal
          isOpen={isDeleteModalOpen}
          title={`Delete MCP Endpoint ${selectedEndpoint.name}?`}
          onChange={(isOpen) => {
            setIsDeleteModalOpen(isOpen);
            if (!isOpen) {
              setSelectedEndpoint(null);
            }
          }}
          deleteKey={selectedEndpoint.name}
          onDeleteApproved={handleDeleteConfirm}
        />
      )}

      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan.data?.text}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
