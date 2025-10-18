import { useEffect, useState } from "react";

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
  useGetVaultAuthMounts,
  useGetVaultKubernetesAuthRoles,
  useGetVaultNamespaces
} from "@app/hooks/api/migration/queries";
import { VaultKubernetesAuthRole } from "@app/hooks/api/migration/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onImport: (role: VaultKubernetesAuthRole) => void;
};

type ContentProps = {
  onClose: () => void;
  onImport: (role: VaultKubernetesAuthRole) => void;
};

const Content = ({ onClose, onImport }: ContentProps) => {
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<VaultKubernetesAuthRole | null>(null);
  const [shouldFetchRoles, setShouldFetchRoles] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const { data: namespaces, isLoading: isLoadingNamespaces } = useGetVaultNamespaces();
  const { data: authMounts, isLoading: isLoadingMounts } = useGetVaultAuthMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined,
    "kubernetes"
  );
  const { data: roles, isLoading: isLoadingRoles } = useGetVaultKubernetesAuthRoles(
    shouldFetchRoles,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined
  );

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

  const handleImportAndApply = () => {
    if (!selectedRole) {
      createNotification({
        type: "error",
        text: "Please select a Kubernetes role to load"
      });
      return;
    }

    onImport(selectedRole);
    onClose();
  };

  return (
    <>
      <FormControl
        label="Namespace"
        className="mb-4"
        tooltipText="Select the Vault namespace containing the Kubernetes auth configuration."
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
            Select the Vault namespace to fetch available auth mounts
          </p>
        </>
      </FormControl>

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
                setSelectedMountPath(mount.path.replace(/\/$/, "")); // Remove trailing slash
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

export const VaultKubernetesAuthImportModal = ({ isOpen, onOpenChange, onImport }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Load Kubernetes Auth from HashiCorp Vault"
        subTitle="Load Kubernetes authentication configuration from your Vault instance. The auth method and role settings will be automatically translated and prefilled in the form."
        className="max-w-2xl"
      >
        <Content onClose={() => onOpenChange(false)} onImport={onImport} />
      </ModalContent>
    </Modal>
  );
};
