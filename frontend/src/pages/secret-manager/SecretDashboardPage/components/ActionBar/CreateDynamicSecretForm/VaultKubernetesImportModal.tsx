import { useEffect, useState } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import {
  useGetVaultKubernetesRoles,
  useGetVaultMounts,
  useGetVaultNamespaces
} from "@app/hooks/api/migration/queries";
import { VaultKubernetesRole } from "@app/hooks/api/migration/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onImport: (role: VaultKubernetesRole) => void;
};

type ContentProps = {
  onClose: () => void;
  onImport: (role: VaultKubernetesRole) => void;
};

const Content = ({ onClose, onImport }: ContentProps) => {
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<VaultKubernetesRole | null>(null);
  const [shouldFetchRoles, setShouldFetchRoles] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const { data: namespaces, isLoading: isLoadingNamespaces } = useGetVaultNamespaces();
  const { data: roles, isLoading: isLoadingRoles } = useGetVaultKubernetesRoles(
    shouldFetchRoles,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined
  );
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined
  );

  // Filter to only show Kubernetes mounts
  const kubernetesMounts = mounts?.filter((mount) => mount.type === "kubernetes");

  // Enable fetching mounts when namespace is selected
  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  // Enable fetching roles when both namespace and mount path are selected
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
        text: "Please select a Vault Kubernetes role to load"
      });
      return;
    }

    if (!selectedNamespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }

    if (!mounts || mounts.length === 0) {
      createNotification({
        type: "error",
        text: "No Vault mounts found. Please ensure you have Kubernetes secrets engine configured."
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
              Select a Kubernetes secrets engine role from Vault to pre-fill the form with its
              configuration including cluster URL, CA certificate, TTL settings, etc.
            </p>
          </div>
        </div>
      </div>

      <FormControl
        label="Namespace"
        className="mb-4"
        tooltipText="Select the Vault namespace containing the Kubernetes secrets engine."
      >
        <>
          <FilterableSelect
            value={namespaces?.find((ns) => ns.name === selectedNamespace)}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const namespace = value as { id: string; name: string };
                setSelectedNamespace(namespace.name);
                setSelectedMountPath(null);
                setSelectedRole(null);
              }
            }}
            options={namespaces || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => (option.name === "/" ? "root" : option.name)}
            isDisabled={isLoadingNamespaces}
            placeholder="Select namespace..."
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Select the Vault namespace to fetch available Kubernetes secrets engines
          </p>
        </>
      </FormControl>

      <FormControl
        label="Kubernetes Secrets Engine"
        className="mb-4"
        tooltipText="Select the Kubernetes secrets engine mount to fetch available roles."
      >
        <>
          <FilterableSelect
            value={kubernetesMounts?.find((mount) => mount.path === selectedMountPath)}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const mount = value as { path: string; type: string; version: string | null };
                setSelectedMountPath(mount.path.replace(/\/$/, "")); // Remove trailing slash
                setSelectedRole(null);
              }
            }}
            options={kubernetesMounts || []}
            getOptionValue={(option) => option.path}
            getOptionLabel={(option) => option.path.replace(/\/$/, "")}
            isDisabled={isLoadingMounts || !kubernetesMounts?.length}
            placeholder="Select Kubernetes secrets engine..."
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Choose a Kubernetes secrets engine mount to list available roles
          </p>
        </>
      </FormControl>

      <FormControl label="Kubernetes Role" className="mb-6">
        <>
          <FilterableSelect
            value={selectedRole}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                setSelectedRole(value as VaultKubernetesRole);
              } else {
                setSelectedRole(null);
              }
            }}
            options={roles || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => option.name}
            isDisabled={isLoadingRoles || !roles?.length || !selectedMountPath}
            placeholder={
              !selectedMountPath ? "Select a mount path first..." : "Select a role to load..."
            }
            isClearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Choose a Kubernetes role from the selected mount to load its configuration
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

export const VaultKubernetesImportModal = ({ isOpen, onOpenChange, onImport }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Load from HashiCorp Vault"
        subTitle="Select a Kubernetes secrets engine role to load its configuration."
        className="max-w-2xl"
      >
        <Content onClose={() => onOpenChange(false)} onImport={onImport} />
      </ModalContent>
    </Modal>
  );
};
