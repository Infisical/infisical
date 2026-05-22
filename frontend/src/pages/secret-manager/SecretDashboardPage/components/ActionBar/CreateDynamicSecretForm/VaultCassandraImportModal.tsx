import { useEffect, useState } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  defaultVaultConnectionId,
  VaultConnectionAndNamespaceFields
} from "@app/components/external-migrations";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { useGetVaultDatabaseRoles, useGetVaultMounts } from "@app/hooks/api/migration/queries";
import { VaultDatabaseRole } from "@app/hooks/api/migration/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnections: TAvailableAppConnection[];
  onImport: (role: VaultDatabaseRole) => void;
};

type ContentProps = {
  onClose: () => void;
  appConnections: TAvailableAppConnection[];
  onImport: (role: VaultDatabaseRole) => void;
};

const Content = ({ onClose, appConnections, onImport }: ContentProps) => {
  const hasAppConnections = appConnections.length > 0;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    defaultVaultConnectionId(appConnections)
  );
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<VaultDatabaseRole | null>(null);
  const [shouldFetchRoles, setShouldFetchRoles] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const activeConnectionId = hasAppConnections ? (selectedConnectionId ?? undefined) : undefined;

  const { data: roles, isLoading: isLoadingRoles } = useGetVaultDatabaseRoles(
    shouldFetchRoles,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined,
    activeConnectionId
  );
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined,
    activeConnectionId
  );

  const databaseMounts = mounts?.filter((mount) => mount.type === "database");

  const cassandraRoles = roles?.filter((role) =>
    role.config.plugin_name?.toLowerCase().includes("cassandra")
  );

  const handleConnectionChange = (id: string) => {
    setSelectedConnectionId(id);
    setSelectedNamespace(null);
    setSelectedMountPath(null);
    setSelectedRole(null);
    setShouldFetchMounts(false);
    setShouldFetchRoles(false);
  };

  const handleNamespaceChange = (ns: string) => {
    setSelectedNamespace(ns);
    setSelectedMountPath(null);
    setSelectedRole(null);
  };

  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  useEffect(() => {
    if (selectedNamespace && selectedMountPath) {
      setShouldFetchRoles(true);
    } else {
      setShouldFetchRoles(false);
    }
  }, [selectedNamespace, selectedMountPath]);

  const handleImport = () => {
    if (!selectedRole) {
      createNotification({
        type: "error",
        text: "Please select a Vault Cassandra role to load"
      });
      return;
    }

    if (!selectedNamespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }

    if (hasAppConnections && !selectedConnectionId) {
      createNotification({ type: "error", text: "Please select an app connection" });
      return;
    }

    if (!mounts || mounts.length === 0) {
      createNotification({
        type: "error",
        text: "No Vault mounts found. Please ensure you have database secrets engine configured."
      });
      return;
    }

    onImport(selectedRole);
    onClose();
  };

  return (
    <>
      <div className="mb-4 rounded-md bg-primary/10 p-3 text-sm text-mineshaft-200">
        <div className="flex items-start gap-2">
          <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-primary" />
          <div className="space-y-1.5 text-xs leading-relaxed">
            <p>
              Select a Cassandra database role from Vault to pre-fill the form with its
              configuration including connection details, creation/revocation statements, TTL
              settings, etc.
            </p>
          </div>
        </div>
      </div>

      <VaultConnectionAndNamespaceFields
        appConnections={appConnections}
        connectionId={selectedConnectionId}
        onConnectionIdChange={handleConnectionChange}
        namespace={selectedNamespace}
        onNamespaceChange={handleNamespaceChange}
        namespaceTooltip="Select the Vault namespace containing the database secrets engine."
        namespaceHelpText="Select the Vault namespace to fetch available database secrets engines"
      />

      <FormControl
        label="Database Secrets Engine"
        className="mb-4"
        tooltipText="Select the database secrets engine mount to fetch available Cassandra roles."
      >
        <>
          <FilterableSelect
            value={databaseMounts?.find((mount) => mount.path === selectedMountPath)}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const mount = value as { path: string; type: string; version: string | null };
                setSelectedMountPath(mount.path.replace(/\/$/, ""));
                setSelectedRole(null);
              }
            }}
            options={databaseMounts || []}
            getOptionValue={(option) => option.path}
            getOptionLabel={(option) => option.path.replace(/\/$/, "")}
            isDisabled={isLoadingMounts || !databaseMounts?.length}
            placeholder="Select database secrets engine..."
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Choose a database secrets engine mount to list available Cassandra roles
          </p>
        </>
      </FormControl>

      <FormControl label="Cassandra Role" className="mb-6">
        <>
          <FilterableSelect
            value={selectedRole}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                setSelectedRole(value as VaultDatabaseRole);
              } else {
                setSelectedRole(null);
              }
            }}
            options={cassandraRoles || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => option.name}
            isDisabled={isLoadingRoles || !cassandraRoles?.length || !selectedMountPath}
            placeholder={(() => {
              if (!selectedMountPath) return "Select a mount path first...";
              if (cassandraRoles?.length === 0) return "No Cassandra roles found...";
              return "Select a role to load...";
            })()}
            isClearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Choose a Cassandra role from the selected mount to load its configuration
          </p>
        </>
      </FormControl>

      <div className="mt-8 flex space-x-4">
        <Button
          onClick={handleImport}
          isDisabled={!selectedRole || isLoadingMounts || isLoadingRoles}
        >
          Load Configuration
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};

export const VaultCassandraImportModal = ({
  isOpen,
  onOpenChange,
  appConnections,
  onImport
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Load from HashiCorp Vault"
        subTitle="Select a Cassandra database role to load its configuration."
        className="max-w-2xl"
      >
        <Content
          onClose={() => onOpenChange(false)}
          appConnections={appConnections}
          onImport={onImport}
        />
      </ModalContent>
    </Modal>
  );
};
