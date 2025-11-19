import { useState } from "react";
import { faEdit, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
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
import { useOrganization } from "@app/context";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useDeleteVaultExternalMigrationConfig,
  useGetVaultExternalMigrationConfigs
} from "@app/hooks/api/migration";
import { TVaultExternalMigrationConfig } from "@app/hooks/api/migration/types";

import { VaultNamespaceConfigModal } from "./VaultNamespaceConfigModal";

export const VaultConnectionSection = () => {
  const [selectedConfig, setSelectedConfig] = useState<TVaultExternalMigrationConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<TVaultExternalMigrationConfig | null>(null);

  const { data: configs = [], isPending: isLoadingConfigs } = useGetVaultExternalMigrationConfigs();

  const { currentOrg } = useOrganization();
  const { data: appConnections = [] } = useListAppConnections();
  const { mutateAsync: deleteConfig } = useDeleteVaultExternalMigrationConfig();

  const handleEdit = (config: TVaultExternalMigrationConfig) => {
    setSelectedConfig(config);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedConfig(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (config: TVaultExternalMigrationConfig) => {
    setConfigToDelete(config);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!configToDelete) return;

    await deleteConfig({ id: configToDelete.id });
    createNotification({
      type: "success",
      text: "Namespace configuration deleted successfully"
    });
    setIsDeleteModalOpen(false);
    setConfigToDelete(null);
  };

  const getConnectionName = (connectionId: string | null) => {
    if (!connectionId) return "None";
    const connection = appConnections.find((conn) => conn.id === connectionId);
    return connection?.name || "Unknown";
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img
            src="/images/integrations/Vault.png"
            alt="HashiCorp Vault logo"
            className="h-10 w-10 rounded-md bg-bunker-500 p-2"
          />
          <div>
            <h3 className="text-lg font-medium text-mineshaft-100">HashiCorp Vault</h3>
            <p className="text-sm text-gray-400">
              Enable in-platform migration tooling for policy imports, auth methods, and secret
              engine migrations
            </p>
          </div>
        </div>
        <Button
          colorSchema="primary"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={handleAdd}
        >
          Add Namespace
        </Button>
      </div>

      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Namespace</Th>
              <Th>Connection</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoadingConfigs && (
              <TableSkeleton columns={3} innerKey="vault-configs-loading" rows={3} />
            )}
            {!isLoadingConfigs && configs.length === 0 && (
              <Tr>
                <Td colSpan={3}>
                  <EmptyState title="No namespace configurations" icon={faPlus} className="py-8">
                    <p className="mb-4 text-sm text-mineshaft-400">
                      Add a namespace configuration to enable in-platform migration features.
                    </p>
                  </EmptyState>
                </Td>
              </Tr>
            )}
            {!isLoadingConfigs &&
              configs.map((config) => (
                <Tr key={config.id} className="group h-10">
                  <Td>{config.namespace}</Td>
                  <Td>{getConnectionName(config.connectionId)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="plain"
                        colorSchema="secondary"
                        size="xs"
                        onClick={() => handleEdit(config)}
                        leftIcon={<FontAwesomeIcon icon={faEdit} />}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="plain"
                        colorSchema="danger"
                        size="xs"
                        onClick={() => handleDeleteClick(config)}
                        leftIcon={<FontAwesomeIcon icon={faTrash} />}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </TableContainer>

      <p className="mt-4 text-xs text-mineshaft-400">
        Configure namespace-specific connections to enable in-platform migration features. Manage
        connections in the{" "}
        <Link
          to="/organizations/$orgId/app-connections"
          params={{ orgId: currentOrg.id }}
          className="text-primary underline hover:text-primary-300"
        >
          App Connections
        </Link>{" "}
        section.
      </p>

      <VaultNamespaceConfigModal
        isOpen={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setSelectedConfig(null);
        }}
        editConfig={selectedConfig || undefined}
      />

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        title={`Delete namespace configuration for "${configToDelete?.namespace}"?`}
        onChange={(open) => {
          setIsDeleteModalOpen(open);
          if (!open) setConfigToDelete(null);
        }}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteConfirm}
      />
    </div>
  );
};
