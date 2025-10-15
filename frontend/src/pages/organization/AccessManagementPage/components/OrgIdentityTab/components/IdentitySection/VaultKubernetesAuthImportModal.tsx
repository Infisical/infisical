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
  const [selectedRole, setSelectedRole] = useState<VaultKubernetesAuthRole | null>(null);
  const [shouldFetchRoles, setShouldFetchRoles] = useState(false);

  const { data: namespaces, isLoading: isLoadingNamespaces } = useGetVaultNamespaces();
  const { data: roles, isLoading: isLoadingRoles } = useGetVaultKubernetesAuthRoles(
    shouldFetchRoles,
    selectedNamespace ?? undefined
  );

  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchRoles(true);
    }
  }, [selectedNamespace]);

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
          <p className="text-mineshaft-400 mt-1 text-xs">
            Select the Vault namespace to fetch available Kubernetes auth roles
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
            getOptionLabel={(option) => `${option.name} (${option.mountPath})`}
            isDisabled={isLoadingRoles || !roles?.length}
            placeholder="Select a Kubernetes role to load..."
            isClearable
            className="w-full"
          />
          <p className="text-mineshaft-400 mt-1 text-xs">
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
