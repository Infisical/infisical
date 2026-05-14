import { useEffect, useState } from "react";

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
import {
  useGetVaultAuthMounts,
  useGetVaultKubernetesAuthRoles
} from "@app/hooks/api/migration/queries";
import { VaultKubernetesAuthRole } from "@app/hooks/api/migration/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnections: TAvailableAppConnection[];
  onImport: (role: VaultKubernetesAuthRole) => void;
};

type ContentProps = {
  onClose: () => void;
  appConnections: TAvailableAppConnection[];
  onImport: (role: VaultKubernetesAuthRole) => void;
};

const Content = ({ onClose, appConnections, onImport }: ContentProps) => {
  const hasAppConnections = appConnections.length > 0;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    defaultVaultConnectionId(appConnections)
  );
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<VaultKubernetesAuthRole | null>(null);
  const [shouldFetchRoles, setShouldFetchRoles] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const activeConnectionId = hasAppConnections ? (selectedConnectionId ?? undefined) : undefined;

  const { data: authMounts, isLoading: isLoadingMounts } = useGetVaultAuthMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined,
    "kubernetes",
    activeConnectionId
  );
  const { data: roles, isLoading: isLoadingRoles } = useGetVaultKubernetesAuthRoles(
    shouldFetchRoles,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined,
    activeConnectionId
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

  const handleImportAndApply = () => {
    if (!selectedRole) {
      createNotification({
        type: "error",
        text: "Please select a Kubernetes role to load"
      });
      return;
    }

    if (hasAppConnections && !selectedConnectionId) {
      createNotification({ type: "error", text: "Please select an app connection" });
      return;
    }

    onImport(selectedRole);
    onClose();
  };

  return (
    <>
      <VaultConnectionAndNamespaceFields
        appConnections={appConnections}
        connectionId={selectedConnectionId}
        onConnectionIdChange={handleConnectionChange}
        namespace={selectedNamespace}
        onNamespaceChange={handleNamespaceChange}
        namespaceTooltip="Select the Vault namespace containing the Kubernetes auth configuration."
        namespaceHelpText="Select the Vault namespace to fetch available auth mounts"
      />

      <FormControl
        label="Auth Engine"
        className="mb-4"
        tooltipText="Select the Kubernetes auth engine to narrow down available roles."
      >
        <>
          <FilterableSelect
            value={
              selectedMountPath
                ? authMounts?.find((mount) => mount.path === selectedMountPath)
                : null
            }
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const mount = value as { path: string; type: string };
                setSelectedMountPath(mount.path.replace(/\/$/, ""));
                setSelectedRole(null);
              } else {
                setSelectedMountPath(null);
              }
            }}
            options={authMounts || []}
            getOptionValue={(option) => option.path}
            getOptionLabel={(option) => option.path.replace(/\/$/, "")}
            isDisabled={isLoadingMounts || !authMounts?.length}
            placeholder="Select auth engine..."
            isClearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Choose a Kubernetes auth engine to filter available roles
          </p>
        </>
      </FormControl>

      <FormControl label="Kubernetes Role" className="mb-6">
        <>
          <FilterableSelect
            value={selectedRole}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                setSelectedRole(value as VaultKubernetesAuthRole);
              } else {
                setSelectedRole(null);
              }
            }}
            options={roles || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => option.name}
            isDisabled={isLoadingRoles || !roles?.length || !selectedMountPath}
            placeholder={
              !selectedMountPath
                ? "Select an auth engine first..."
                : "Select a Kubernetes role to load..."
            }
            isClearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Select the Kubernetes role to load configuration from
          </p>
        </>
      </FormControl>

      <div className="mt-8 flex space-x-4">
        <Button onClick={handleImportAndApply} isDisabled={!selectedRole || isLoadingRoles}>
          Load
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

export const VaultKubernetesAuthImportModal = ({
  isOpen,
  onOpenChange,
  appConnections,
  onImport
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Load Kubernetes Auth from HashiCorp Vault"
        subTitle="Load Kubernetes authentication configuration from your Vault instance. The auth method and role settings will be automatically translated and prefilled in the form."
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
