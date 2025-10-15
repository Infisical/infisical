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
  useGetVaultMounts,
  useGetVaultNamespaces,
  useGetVaultSecretPaths
} from "@app/hooks/api/migration/queries";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environment: string;
  secretPath: string;
  onImport: (vaultPath: string, namespace: string) => void;
};

type ContentProps = {
  onClose: () => void;
  environment: string;
  secretPath: string;
  onImport: (vaultPath: string, namespace: string) => void;
};

const Content = ({ onClose, environment, secretPath, onImport }: ContentProps) => {
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [shouldFetchPaths, setShouldFetchPaths] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const { data: namespaces, isLoading: isLoadingNamespaces } = useGetVaultNamespaces();
  const { data: secretPaths, isLoading: isLoadingPaths } = useGetVaultSecretPaths(
    shouldFetchPaths,
    selectedNamespace ?? undefined
  );
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined
  );

  // Enable fetching paths and mounts when namespace is selected
  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchPaths(true);
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  const handleImport = () => {
    if (!selectedPath) {
      createNotification({ type: "error", text: "Please select a Vault secret path to import" });
      return;
    }

    if (!selectedNamespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }

    if (!mounts || mounts.length === 0) {
      createNotification({
        type: "error",
        text: "No Vault mounts found. Please ensure you have KV secret engines configured."
      });
      return;
    }

    onImport(selectedPath, selectedNamespace);
    onClose();
  };

  return (
    <>
      <div className="bg-primary/10 text-mineshaft-200 mb-4 rounded-md p-3 text-sm">
        <div className="flex items-start gap-2">
          <FontAwesomeIcon icon={faInfoCircle} className="text-primary mt-0.5" />
          <div>
            <div className="mb-2">
              <strong>Import Secrets from HashiCorp Vault</strong>
            </div>
            <div className="space-y-1.5 text-xs leading-relaxed">
              <p>
                Select a Vault namespace and secret path to import secrets into the current
                Infisical environment (<code className="text-xs">{environment}</code>) at path{" "}
                <code className="text-xs">{secretPath}</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <FormControl
        label="Namespace"
        className="mb-4"
        tooltipText="Select the Vault namespace containing the secrets you want to import."
      >
        <>
          <FilterableSelect
            value={namespaces?.find((ns) => ns.name === selectedNamespace)}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const namespace = value as { id: string; name: string };
                setSelectedNamespace(namespace.name);
                setSelectedPath(null);
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
            Select the Vault namespace to fetch available secret paths
          </p>
        </>
      </FormControl>

      <FormControl label="Vault Secret Path" className="mb-6">
        <>
          <FilterableSelect
            value={selectedPath ? { path: selectedPath } : null}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                setSelectedPath((value as { path: string }).path);
              } else {
                setSelectedPath(null);
              }
            }}
            options={(secretPaths || []).map((path) => ({ path }))}
            getOptionValue={(option) => option.path}
            getOptionLabel={(option) => option.path}
            isDisabled={isLoadingPaths || !secretPaths?.length}
            placeholder="Select a Vault path to import..."
            isClearable
            className="w-full"
          />
          <p className="text-mineshaft-400 mt-1 text-xs">
            Choose a secret path from your Vault namespace to import into Infisical
          </p>
        </>
      </FormControl>

      <div className="mt-8 flex space-x-4">
        <Button
          onClick={handleImport}
          isDisabled={!selectedPath || isLoadingMounts || isLoadingPaths}
        >
          Import Secrets
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

export const VaultSecretImportModal = ({
  isOpen,
  onOpenChange,
  environment,
  secretPath,
  onImport
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Import from HashiCorp Vault"
        subTitle="Select a Vault namespace and secret path to import secrets into the current environment and folder."
        className="max-w-2xl"
      >
        <Content
          onClose={() => onOpenChange(false)}
          environment={environment}
          secretPath={secretPath}
          onImport={onImport}
        />
      </ModalContent>
    </Modal>
  );
};
